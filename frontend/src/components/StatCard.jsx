import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from './ui/card';

export default function StatCard({ label, value, sub, linkable }) {
  return (
    <Card className={linkable ? 'hover:border-primary/50 transition-colors' : ''}>
      <CardContent className="pt-4 relative">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold text-foreground">{value ?? '—'}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        {linkable && (
          <ChevronRight size={14} className="absolute top-3 right-3 text-muted-foreground" />
        )}
      </CardContent>
    </Card>
  );
}
