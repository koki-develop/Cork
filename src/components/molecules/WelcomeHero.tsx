import type { ReactNode } from "react";

import { Button, Heading, Text } from "@/components/atoms";

export type WelcomeHeroProps = {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaIcon?: ReactNode;
  onCta: () => void;
};

export function WelcomeHero({ title, subtitle, ctaLabel, ctaIcon, onCta }: WelcomeHeroProps) {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3">
        <Heading level={1} variant="hero">
          {title}
        </Heading>
        <Text variant="muted" size="sm">
          {subtitle}
        </Text>
      </div>
      <Button variant="primary" size="lg" onClick={onCta} className="gap-2 rounded-xl">
        {ctaIcon}
        {ctaLabel}
      </Button>
    </div>
  );
}
