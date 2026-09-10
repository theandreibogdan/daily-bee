import { Avatar, type AvatarProps } from '@dailybee/ui';
import { useStore } from '../store';

/**
 * An avatar for anyone identified by initials (team members, task owners): your own initials get
 * your profile picture, everyone else keeps initials, since pictures never leave the device.
 */
export function PersonAvatar(props: Omit<AvatarProps, 'src'>) {
  const own = useStore((s) => (s.settings?.profile.initials === props.initials ? s.settings.profile.avatar : ''));
  return <Avatar {...props} src={own || undefined} />;
}
