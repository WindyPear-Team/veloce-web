import { useLocation } from "react-router-dom"
import type { ReactNode } from "react"

export function PageTransition({ children, transitionKey, className }: { children: ReactNode; transitionKey?: string; className?: string }) {
  const location = useLocation()
  return (
    <div key={transitionKey || location.pathname} className={className ? `animate-page-in ${className}` : "animate-page-in"}>
      {children}
    </div>
  )
}
