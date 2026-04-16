/**
 * @lms/ui — Shared component library (Phase 05).
 *
 * All 15 design-system components are exported from here. Consumers in
 * apps/ should import everything via `@lms/ui` (no deep paths) so we
 * keep one stable surface to evolve.
 */

// Utility
export { cn } from './lib/cn';

// Tier 2 — simple components
export { Avatar, type AvatarProps } from './components/avatar';
export { Badge, badgeVariants, type BadgeProps } from './components/badge';
export { Breadcrumb, type BreadcrumbItem, type BreadcrumbProps } from './components/breadcrumb';
export { Button, buttonVariants, type ButtonProps } from './components/button';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  type CardProps,
} from './components/card';
export { Input, type InputProps } from './components/input';
export {
  CircularProgress,
  Progress,
  type CircularProgressProps,
  type ProgressProps,
} from './components/progress';
export { Skeleton } from './components/skeleton';

// Tier 3 — Radix-based components
export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  type DialogContentProps,
} from './components/dialog';
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './components/dropdown';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/tabs';
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  type TooltipProps,
} from './components/tooltip';

// Tier 4 — complex components
export { toast, Toaster } from './components/toast';
export { Sidebar, type SidebarItem, type SidebarProps } from './components/sidebar';
export { DataTable, type ColumnDef, type DataTableProps } from './components/data-table';
export { FileUploader, type FileUploaderProps } from './components/file-uploader';
