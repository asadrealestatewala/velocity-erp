import { forwardRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-gradient-action text-white shadow-[0_6px_16px_-6px_rgb(214_48_122/0.55)] hover:brightness-110 hover:shadow-[0_8px_20px_-6px_rgb(214_48_122/0.7)] active:scale-[0.98]",
  blue: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm active:scale-[0.98]",
  secondary: "bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 hover:border-ink-300 active:scale-[0.98]",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  danger: "bg-red-600 text-white hover:bg-red-700",
  dark: "bg-navy-900 text-white hover:bg-navy-700 active:scale-[0.98]",
  // Outlined primary, as used for secondary actions in the reference dashboard
  outlineBrand: "border border-brand-500/60 text-brand-700 bg-white hover:bg-brand-50 active:scale-[0.98]",
} as const;

const sizes = {
  xs: "h-8 px-2.5 text-[13px] gap-1 rounded-md",
  sm: "h-9 px-3.5 text-[14px] gap-1.5 rounded-md",
  md: "h-10 px-4 text-[15px] gap-2 rounded-md",
  lg: "h-12 px-6 text-[16px] gap-2 rounded-lg",
  icon: "h-10 w-10 rounded-md justify-center",
  iconSm: "h-8 w-8 rounded-md justify-center",
} as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
};

export const buttonClass = (variant: keyof typeof variants = "primary", size: keyof typeof sizes = "md", className?: string) =>
  cn(
    "inline-flex items-center font-medium whitespace-nowrap transition duration-150 select-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
    variants[variant],
    sizes[size],
    className,
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: { href: string; variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
