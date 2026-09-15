import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

export default function DesktopGate({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const ua = navigator.userAgent || "";
      const isPhoneUA = /Android|iPhone|iPod|Mobile|Opera Mini|IEMobile|Windows Phone|BlackBerry/i.test(ua);
      const isTabletUA = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const small = window.innerWidth <= 820;
      setIsMobile(isPhoneUA || isTabletUA || (coarse && small));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f6f9]">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">🖥️</div>
          <h1 className="text-2xl font-extrabold text-[#2c3e50]">{t("gate.title")}</h1>
          <p className="text-sm text-gray-500 mt-3 leading-relaxed">
            {t("gate.desc1")} <b>Desktop PC / Laptop</b>. {t("gate.desc2")}
          </p>
          <div className="mt-5 bg-[#ecf0f1] rounded-lg p-3 text-xs text-gray-500">
            {t("gate.notice")}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
