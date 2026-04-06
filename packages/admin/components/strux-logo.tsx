/**
 * Strux CMS Logo Component
 * 
 * The official Strux logo mark — a 4-square grid with graduating opacity,
 * matching the favicon and sidebar branding.
 */

interface StruxLogoProps {
  size?: number
  className?: string
}

export function StruxLogoMark({ size = 40, className = '' }: StruxLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="2" y="2" width="10" height="10" rx="2" fill="hsl(var(--primary))" opacity="0.9" />
      <rect x="16" y="2" width="10" height="10" rx="2" fill="hsl(var(--primary))" opacity="0.6" />
      <rect x="2" y="16" width="10" height="10" rx="2" fill="hsl(var(--primary))" opacity="0.6" />
      <rect x="16" y="16" width="10" height="10" rx="2" fill="hsl(var(--primary))" opacity="0.3" />
    </svg>
  )
}

export function StruxWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      Strux <span className="font-normal text-muted-foreground">CMS</span>
    </span>
  )
}

export function StruxLogo({ size = 40, textSize = 'text-2xl', className = '' }: StruxLogoProps & { textSize?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <StruxLogoMark size={size} />
      <StruxWordmark className={textSize} />
    </div>
  )
}
