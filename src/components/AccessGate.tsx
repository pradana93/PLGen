import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n";

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6f9]">
        <div className="text-center">
          <div className="text-2xl mb-3">🛡️</div>
          <div className="text-sm text-gray-500">{t("auth.loading")}</div>
        </div>
      </div>
    );
  }

  // Not logged in — let Login route handle it
  if (!user) return <>{children}</>;

  // Banned — but SuperAdmin is immortal (never blocked even if DB glitch sets banned=true)
  if (profile?.banned && profile?.role !== "Super Admin") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f6f9]">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">🔨</div>
          <h1 className="text-2xl font-extrabold text-[#c0392b] mb-2">Account Suspended</h1>
          <p className="text-sm text-gray-500 mb-2">Your account has been suspended by the administrator.</p>
          {profile.banned_reason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <div className="text-xs font-bold text-[#c0392b] mb-1">Reason:</div>
              <div className="text-sm text-gray-700">{profile.banned_reason}</div>
            </div>
          )}
          {profile.banned_until && (
            <div className="text-xs text-gray-400 mb-4">
              Until: {new Date(profile.banned_until).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
            </div>
          )}
          {!profile.banned_until && (
            <div className="text-xs text-gray-400 mb-4">Permanent — contact administrator to appeal.</div>
          )}
          <button onClick={signOut} className="w-full bg-[#c0392b] hover:bg-[#a93226] text-white rounded-lg py-3 font-bold text-sm transition-colors">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Pending approval — SuperAdmin is immortal, always approved
  if (profile && profile.approved === false && profile?.role !== "Super Admin") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f6f9]">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">⏳</div>
          <h1 className="text-2xl font-extrabold text-[#f39c12] mb-2">Pending Approval</h1>
          <p className="text-sm text-gray-500 mb-4">Your account is awaiting administrator approval. You will be able to access the app once approved.</p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <div className="text-xs text-gray-500">Account: <b>{user.email}</b></div>
          </div>
          <button onClick={signOut} className="w-full bg-gray-400 hover:bg-gray-500 text-white rounded-lg py-3 font-bold text-sm transition-colors">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
