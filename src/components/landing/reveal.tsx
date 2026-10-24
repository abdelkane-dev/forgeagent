import { motion, useReducedMotion, type Variants } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * Staggered entrance for the parts of a section: heading, then text, then picture.
 * Content is visible without script (initial state is only applied after hydration by motion),
 * and reduced motion keeps the fade but drops the travel.
 */
export function Stagger({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} transition={{ staggerChildren: 0.075, delayChildren: delay }}>
      {children}
    </motion.div>
  )
}

export function Item({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' | 'p' | 'h2' }) {
  const reduce = useReducedMotion()
  const v: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  }
  const C = motion[as]
  return (
    <C variants={v} className={className}>
      {children}
    </C>
  )
}

/** Signature move: the picture opens from the left edge while it settles from 1.12 scale to rest. */
export function Shutter({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ clipPath: 'inset(0 100% 0 0)' }}
      whileInView={{ clipPath: 'inset(0 0% 0 0)' }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 1.1, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.div initial={{ scale: 1.12 }} whileInView={{ scale: 1 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }} className="size-full">
        {children}
      </motion.div>
    </motion.div>
  )
}
