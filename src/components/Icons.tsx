// src/components/Icons.tsx
// Inline SVG icons — the app uses no emoji for UI icons. Each icon inherits
// color via currentColor and is sized with the `size` prop (default 1em-ish).
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: "-0.15em", flex: "none" }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 5v14l11-7z" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </Svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </Svg>
  );
}

export function PrevIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6h2v12H6zM17 6v12l-9-6z" />
    </Svg>
  );
}

export function NextIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 6h2v12h-2zM7 6l9 6-9 6z" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 2a8 8 0 105.29 14l4.35 4.36 1.42-1.42-4.36-4.35A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z" />
    </Svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 3h12a3 3 0 013 3v15H7a3 3 0 01-3-3V3zm2 2v13a1 1 0 001 1h10V6a1 1 0 00-1-1H6zm2 3h7v2H8V8zm0 4h7v2H8v-2z" />
    </Svg>
  );
}

export function MusicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 3v11.5a3.5 3.5 0 11-2-3.16V6.3l-8 1.6v9.1a3.5 3.5 0 11-2-3.16V6l12-3z" />
    </Svg>
  );
}

export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return filled ? (
    <Svg {...props}>
      <path d="M12 21s-7.5-4.6-10-8.9C.6 9.3 2.3 5.5 6 5.5c2.1 0 3.4 1.1 6 3.1 2.6-2 3.9-3.1 6-3.1 3.7 0 5.4 3.8 4 6.6C19.5 16.4 12 21 12 21z" />
    </Svg>
  ) : (
    <Svg {...props}>
      <path
        d="M12 19.6l-.6-.5C5.4 14.3 2 11.3 2 7.8 2 5.1 4.1 3 6.8 3c1.6 0 3.1.8 4.2 2.1C12.1 3.8 13.6 3 15.2 3 17.9 3 20 5.1 20 7.8c0 3.5-3.4 6.5-9.4 11.3l-.6.5zM6.8 5C5.2 5 4 6.2 4 7.8c0 2.5 2.6 5.1 8 9.3 5.4-4.2 8-6.8 8-9.3C20 6.2 18.8 5 17.2 5c-1.3 0-2.6.9-3.6 2.3h-1.2C11.4 5.9 10.1 5 8.8 5z"
        fillRule="evenodd"
      />
    </Svg>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-4 4.9V19h2v2H9v-2h2v-3.1A5 5 0 016 11h2a4 4 0 008 0h1z" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z" />
    </Svg>
  );
}

export function FlatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3v10.6c-1.1-.7-2.4-1-3.7-.7C8 13.3 6.5 15 6.5 17c0 2 1.6 3.5 3.6 3.5 2.5 0 4.4-2 4.4-4.6V3h-0.5z" />
    </Svg>
  );
}

export function SharpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.5 3v4.4l-3 .9V3.5H5.6v5.6L3.5 9.8v2l2.1-.7v3.3l-2.1.7v2l2.1-.7V22h1.9v-5.4l3-.9V22h1.9v-6.3l2.1-.7v-2l-2.1.7v-3.3l2.1-.7v-2l-2.1.7V3h-1.9zm0 9.6l-3 .9v-3.3l3-.9v3.3z" />
    </Svg>
  );
}
