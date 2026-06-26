import { ReactNode } from 'react';

interface LoadingProps {
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function Loading({ children, size = 'md', className = '' }: LoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`animate-spin rounded-full border-b-2 border-brand-500 ${sizeClasses[size]}`} />
      {children && <span className="ml-2 text-gray-600 dark:text-gray-400">{children}</span>}
    </div>
  );
}
