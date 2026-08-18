import {
  Baby,
  BookOpen,
  Briefcase,
  Clapperboard,
  Gamepad2,
  Globe2,
  HeartPulse,
  LayoutGrid,
  Music2,
  Newspaper,
  Plane,
  Radio,
  Sparkles,
  Tag,
  Trophy,
  Tv,
  type LucideIcon,
} from 'lucide-react'

const iconForCategory = (value: string): LucideIcon => {
  const category = value.toLowerCase()
  if (category === 'all') return LayoutGrid
  if (/(animation|anime|cartoon)/.test(category)) return Sparkles
  if (/(kids|children|child|family)/.test(category)) return Baby
  if (/(sport|football|soccer|basket|tennis)/.test(category)) return Trophy
  if (/(travel|tourism)/.test(category)) return Plane
  if (/(movie|film|cinema)/.test(category)) return Clapperboard
  if (/(series|show|entertainment)/.test(category)) return Tv
  if (/(music|radio)/.test(category)) return Music2
  if (/(news|current affairs)/.test(category)) return Newspaper
  if (/(business|finance|economy)/.test(category)) return Briefcase
  if (/(education|documentary|science|culture)/.test(category)) return BookOpen
  if (/(game|gaming|esport)/.test(category)) return Gamepad2
  if (/(religion|health|lifestyle)/.test(category)) return HeartPulse
  if (/(general|undefined|international|world)/.test(category)) return Globe2
  if (/(tv|television)/.test(category)) return Tv
  if (/(live|stream)/.test(category)) return Radio
  return Tag
}

export function CategoryIcon({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = iconForCategory(name)
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />
}
