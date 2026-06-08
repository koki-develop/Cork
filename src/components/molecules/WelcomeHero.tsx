import type { ReactNode } from "react";

import logoUrl from "@/assets/logo.png";
import { Button, Heading } from "@/components/atoms";

export type WelcomeHeroProps = {
  title: string;
  ctaLabel: string;
  ctaIcon?: ReactNode;
  onCta: () => void;
};

export function WelcomeHero({ title, ctaLabel, ctaIcon, onCta }: WelcomeHeroProps) {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-4">
        <Heading level={1} variant="hero" className="font-display">
          {title}
        </Heading>
        <img src={logoUrl} alt="" className="size-28 drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]" />
      </div>
      <Button variant="primary" size="lg" onClick={onCta} className="gap-2 rounded-xl">
        {ctaIcon}
        {ctaLabel}
      </Button>
    </div>
  );
}
