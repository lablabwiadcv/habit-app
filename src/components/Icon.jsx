import {
  Apple,
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bike,
  Bird,
  BookOpen,
  Brain,
  CalendarDays,
  Cat,
  Check,
  Circle,
  CircleDashed,
  Clock,
  Cloud,
  Code,
  Coffee,
  CornerDownLeft,
  Crown,
  Diamond,
  Dog,
  Droplet,
  Dumbbell,
  Ellipsis,
  Fish,
  Flame,
  Flower2,
  Frown,
  Footprints,
  Heart,
  House,
  Laugh,
  Leaf,
  LockKeyhole,
  Meh,
  Moon,
  Mountain,
  Music,
  NotebookPen,
  PanelsTopLeft,
  Pencil,
  Plus,
  Rabbit,
  Rocket,
  RotateCw,
  Search,
  Smile,
  SmilePlus,
  Sparkles,
  Star,
  Sun,
  Target,
  ChartNoAxesCombined,
  X,
  User,
} from "lucide-react";

const icons = {
  Activity,
  Apple,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bike,
  Bird,
  BookOpen,
  Brain,
  CalendarDays,
  Cat,
  Check,
  Circle,
  CircleDashed,
  Clock,
  Cloud,
  Code,
  Coffee,
  CornerDownLeft,
  Crown,
  Diamond,
  Dog,
  Droplet,
  Dumbbell,
  Ellipsis,
  Fish,
  Flame,
  Flower2,
  Frown,
  Footprints,
  Heart,
  House,
  Laugh,
  Leaf,
  LockKeyhole,
  Meh,
  Moon,
  Mountain,
  Music,
  NotebookPen,
  PanelsTopLeft,
  Pencil,
  Plus,
  Rabbit,
  Rocket,
  RotateCw,
  Search,
  Smile,
  SmilePlus,
  Sparkles,
  Star,
  Sun,
  Target,
  ChartNoAxesCombined,
  X,
  User,
};

const emojiIcons = {
  "emoji-panda": "🐼",
  "emoji-fox": "🦊",
  "emoji-bear": "🐻",
  "emoji-frog": "🐸",
  "emoji-unicorn": "🦄",
  "emoji-butterfly": "🦋",
  "emoji-bee": "🐝",
  "emoji-turtle": "🐢",
  "emoji-penguin": "🐧",
  "emoji-octopus": "🐙",
  "emoji-dinosaur": "🦖",
  "emoji-rainbow": "🌈",
  "emoji-heart": "💖",
  "emoji-mushroom": "🍄",
  "emoji-strawberry": "🍓",
  "emoji-pizza": "🍕",
  "emoji-bubble-tea": "🧋",
  "emoji-cactus": "🌵",
};

export default function Icon({ name, size = 20, className = "" }) {
  const emoji = typeof name === "string" ? emojiIcons[name] : null;
  if (emoji) {
    return (
      <span
        aria-hidden="true"
        className={`icon-emoji ${className}`}
        style={{ fontSize: size }}
      >
        {emoji}
      </span>
    );
  }

  const iconName = String(name || "CircleDashed").split(/[-_\s]/).map((part) =>
    part.charAt(0).toUpperCase() + part.slice(1),
  ).join("");
  const Component = icons[iconName] || CircleDashed;
  return (
    <Component
      aria-hidden="true"
      focusable="false"
      className={className}
      size={size}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={iconName === "Circle" ? "currentColor" : "none"}
    />
  );
}
