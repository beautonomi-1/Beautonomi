'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2 } from 'lucide-react';
import type { FeatureFlag } from '@/lib/feature-flags';

interface FeatureFlagCardProps {
  feature: FeatureFlag;
  onToggle: (feature: FeatureFlag) => void;
  onEdit: (feature: FeatureFlag) => void;
  onDelete: (feature: FeatureFlag) => void;
}

export default function FeatureFlagCard({
  feature,
  onToggle,
  onEdit,
  onDelete,
}: FeatureFlagCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{feature.feature_name}</CardTitle>
            <CardDescription className="mt-1">
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {feature.feature_key}
              </code>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={feature.enabled}
              onCheckedChange={() => onToggle(feature)}
            />
            <Badge variant={feature.enabled ? 'default' : 'secondary'}>
              {feature.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {feature.description && (
          <p className="text-sm text-muted-foreground mb-4">
            {feature.description}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {feature.category && (
              <Badge variant="outline">{feature.category}</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Updated {new Date(feature.updated_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(feature)}
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(feature)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
