import { useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, Settings, UserRound } from "lucide-react";
import { useApp, useLoad } from "@/lib/api";
import { accountRole, type CommunityIdentity } from "@/lib/types";
import { Person } from "@/components/common";
import { timezoneLabel } from "@/components/tutor-timezone";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { memberImageUrl } from "./shared";

export default function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { user } = useApp();
  const identity = useLoad<CommunityIdentity>(user && !user.email_verification_required ? "/community/me" : null);
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const close = () => { setOpen(false); onNavigate(); };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="account-link" aria-label={`Tài khoản: ${user.name}`} title={user.name}>
        <Person name={user.name} src={identity.data?.author.has_avatar ? memberImageUrl(identity.data.author, "avatar") : undefined} />
        <span className="nav-label"><strong>{user.name}</strong><small>{accountRole(user)}</small><small className="account-timezone"><Clock3 size={12} aria-hidden="true" />{timezoneLabel(user.timezone, true)}</small></span>
      </button>
    </PopoverTrigger>
    <PopoverContent className="account-menu" side="top" align="start" aria-label="Tài khoản">
      <Link to={`/community/members/${user.profile_code}`} onClick={close}><UserRound aria-hidden="true" />Xem hồ sơ của tôi</Link>
      <Link to="/settings" onClick={close}><Settings aria-hidden="true" />Cài đặt tài khoản</Link>
    </PopoverContent>
  </Popover>;
}
