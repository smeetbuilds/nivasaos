import Icon from "@/components/Icon";
import { moduleById } from "@/lib/modules/catalog";

export default function ModuleBadge({ moduleId, compact = false }) {
  const module = moduleById(moduleId);
  return <span className={`module-badge module-${module.id}${compact ? " is-compact" : ""}`}><Icon name={module.icon} size={compact ? 14 : 16}/><span>{module.shortLabel}</span></span>;
}
