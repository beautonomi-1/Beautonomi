import React from "react";
import { splitMessageWithLinks } from "@beautonomi/utils";

export { splitMessageWithLinks } from "@beautonomi/utils";

export function LinkifiedMessageText({
  text,
  className,
  linkClassName,
}: {
  text: string;
  className?: string;
  linkClassName?: string;
}) {
  const parts = splitMessageWithLinks(text);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.type === "link" ? (
          <a
            key={`${i}-${p.value}`}
            href={p.value}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName ?? "underline break-all"}
          >
            {p.value}
          </a>
        ) : (
          <React.Fragment key={`${i}-t`}>{p.value}</React.Fragment>
        ),
      )}
    </span>
  );
}
