import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// join class names; later Tailwind classes win over earlier ones
export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
