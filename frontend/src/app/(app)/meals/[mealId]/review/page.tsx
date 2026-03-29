'use client';

import { useParams } from 'next/navigation';
import { MealReviewPage } from '../../../../../features/MealReviewPage';

export default function MealReviewRoute() {
  const params = useParams<{ mealId: string }>();
  return <MealReviewPage mealId={Number(params?.mealId)} />;
}
