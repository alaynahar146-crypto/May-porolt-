import { Car, Refrigerator, Smartphone, Snowflake, Zap } from "lucide-react";
import type { CategoryId } from "../types";

interface CategoryIconProps {
  id: CategoryId;
  className?: string;
}

export function CategoryIcon({ id, className = "w-5 h-5" }: CategoryIconProps) {
  switch (id) {
    case "ac":
      return <Snowflake className={className} aria-hidden="true" />;
    case "car":
      return <Car className={className} aria-hidden="true" />;
    case "elec":
      return <Zap className={className} aria-hidden="true" />;
    case "appl":
      return <Refrigerator className={className} aria-hidden="true" />;
    case "phone":
      return <Smartphone className={className} aria-hidden="true" />;
  }
}
