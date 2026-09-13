"use client";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Arrow } from "@/components/ui/arrow";

export type RankingPreviewEntry = {
  name: string;
  detail: string;
};

export function RankingPreview({
  title,
  entries,
  href,
  emptyMessage = "No rankings yet.",
  showMore = true,
}: {
  title: string;
  entries: RankingPreviewEntry[];
  href: string;
  emptyMessage?: string;
  showMore?: boolean;
}) {
  return (
    <Card as="section" className="ranking-preview" aria-label={title}>
      <p className="overline">{title}</p>
      {entries.length ? (
        <ol>
          {entries.map((entry, index) => (
            <li key={entry.name}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{entry.name}</strong>
                <small>{entry.detail}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="ranking-preview-empty">{emptyMessage}</p>
      )}
      {showMore ? (
        <ButtonLink href={href} variant="link" className="ranking-preview-more">
          Show more
          <Arrow />
        </ButtonLink>
      ) : null}
    </Card>
  );
}
