import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { browserByProcess } from '../browsers';
import { readFirefoxActiveTab } from '../firefox';
import { friendlyAppName, parseBrowserTitle } from '../title';
import type { PermissionStatus, SamplerOptions } from '../types';
import { EMPTY, isSelf, looksLikeUrl, selfSample, type Provider, type RawSample } from './provider';

/**
 * Windows provider. A long-lived PowerShell sidecar answers one JSON line per request:
 *  - foreground window via user32 GetForegroundWindow / GetWindowText / GetWindowThreadProcessId
 *  - browser page URL via UI Automation: the address-bar Edit control's ValuePattern
 * No native Node modules, no browser extension. Nothing beyond UIA is required from the user.
 */
const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class DBWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$BAR_NAMES = @('Address and search bar', 'Address bar', 'Search or enter address', 'Search with Google or enter address', 'Search with DuckDuckGo or enter address', 'Search or enter web address')
function Get-Url([IntPtr]$h) {
  try {
    $root = $AE::FromHandle($h)
    $conds = @()
    foreach ($n in $BAR_NAMES) { $conds += New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, $n) }
    $nameCond = New-Object System.Windows.Automation.OrCondition($conds)
    $editCond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
    $cond = New-Object System.Windows.Automation.AndCondition($editCond, $nameCond)
    $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if ($el -eq $null) { return $null }
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    return $vp.Current.Value
  } catch { return $null }
}
$procCache = @{}
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $parts = $line.Split(' ', 2)
  $id = $parts[0]
  $cmd = 'sample'
  if ($parts.Length -gt 1) { $cmd = $parts[1] }
  $h = [DBWin]::GetForegroundWindow()
  $len = [DBWin]::GetWindowTextLength($h)
  $sb = New-Object System.Text.StringBuilder ($len + 2)
  [void][DBWin]::GetWindowText($h, $sb, $sb.Capacity)
  $procId = [uint32]0
  [void][DBWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = $null
  $desc = $null
  if ($procId -ne 0) {
    if ($procCache.ContainsKey($procId)) { $name = $procCache[$procId][0]; $desc = $procCache[$procId][1] }
    else {
      try {
        $p = Get-Process -Id $procId -ErrorAction Stop
        $name = $p.ProcessName
        try { $desc = $p.MainModule.FileVersionInfo.FileDescription } catch { $desc = $null }
      } catch { $name = $null }
      if ($procCache.Count -gt 200) { $procCache.Clear() }
      $procCache[$procId] = @($name, $desc)
    }
  }
  $url = $null
  if ($cmd -eq 'url' -and $name) { $url = Get-Url $h }
  $o = [ordered]@{ id = $id; pid = $procId; process = $name; app = $desc; title = $sb.ToString(); url = $url }
  [Console]::Out.WriteLine((ConvertTo-Json $o -Compress))
  [Console]::Out.Flush()
}
`;

interface SidecarReply { id: string; pid: number; process: string | null; app: string | null; title: string; url: string | null }
type Pending = { resolve: (r: SidecarReply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
type Sidecar = ChildProcessByStdio<Writable, Readable, Readable>;

export function createWin32Provider(opts: SamplerOptions = {}): Provider {
  const log = opts.log ?? (() => {});
  let proc: Sidecar | null = null;
  let buffer = '';
  let seq = 0;
  const pending = new Map<string, Pending>();

  const ensure = (): Sidecar => {
    if (proc) return proc;
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (d: string) => { const m = d.trim(); if (m && !m.startsWith('#< CLIXML')) log('[tracker/win32] ' + m); });
    p.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let i: number;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line.startsWith('{')) continue;
        try {
          const r = JSON.parse(line) as SidecarReply;
          const q = pending.get(String(r.id));
          if (q) { pending.delete(String(r.id)); clearTimeout(q.timer); q.resolve(r); }
        } catch (e) { log('[tracker/win32] bad reply: ' + String(e)); }
      }
    });
    p.on('exit', (code) => {
      log('[tracker/win32] sidecar exited ' + code);
      if (proc === p) proc = null;
      for (const [id, q] of pending) { clearTimeout(q.timer); q.reject(new Error('sidecar exited')); pending.delete(id); }
    });
    proc = p;
    return p;
  };

  const request = (cmd: 'sample' | 'url', timeoutMs = 4000): Promise<SidecarReply> => new Promise((resolve, reject) => {
    const p = ensure();
    const id = String(++seq);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('sidecar timeout')); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    p.stdin.write(`${id} ${cmd}\n`, (err) => { if (err) { clearTimeout(timer); pending.delete(id); reject(err); } });
  });

  return {
    async sample(wantUrl: boolean): Promise<RawSample> {
      let r: SidecarReply;
      try {
        r = await request('sample');
      } catch (e) {
        log('[tracker/win32] ' + String(e));
        return EMPTY;
      }
      const title = r.title || '';
      if (isSelf(r.pid, opts, r.process, title)) return selfSample(title, opts);
      const browser = browserByProcess(r.process);
      const app = browser ? browser.label : friendlyAppName(r.process, r.app);
      if (!browser) return { app, process: r.process, title, url: null, pageTitle: null, browser: null, urlSource: 'none' };
      let url: string | null = null;
      let urlSource: RawSample['urlSource'] = 'title';
      const pageTitle = parseBrowserTitle(title, browser);
      if (wantUrl) {
        try {
          const u = await request('url', 6000);
          if (looksLikeUrl(u.url)) { url = u.url.trim(); urlSource = 'accessibility'; }
        } catch (e) { log('[tracker/win32] url: ' + String(e)); }
        if (!url && (browser.id === 'firefox' || browser.id === 'zen')) {
          const ff = readFirefoxActiveTab('win32');
          if (ff && (!pageTitle || !ff.title || ff.title === pageTitle)) { url = ff.url; urlSource = 'sessionstore'; }
        }
      }
      return { app, process: r.process, title, url, pageTitle, browser: browser.id, urlSource };
    },
    async permissions(): Promise<PermissionStatus[]> {
      return [
        { id: 'uia', name: 'UI Automation', description: 'Active window title and browser address bar — built into Windows, nothing to grant', state: 'not-required', requestable: false },
      ];
    },
    dispose() {
      const p = proc;
      proc = null;
      if (p) { try { p.stdin.end(); p.kill(); } catch { /* already gone */ } }
    },
  };
}
