import { scoreTrend } from "../server/youtube";

const emergingOutlier = scoreTrend({
  views: 500_000,
  likes: 32_000,
  comments: 3_200,
  ageHours: 24,
  subscribers: 20_000,
  channelAverageViews: 5_000,
  previousViewsPerHour: 8_000,
  queryHits: 3,
  isShort: false,
});

const largeChannelRoutine = scoreTrend({
  views: 1_000_000,
  likes: 20_000,
  comments: 900,
  ageHours: 24,
  subscribers: 10_000_000,
  channelAverageViews: 2_000_000,
  previousViewsPerHour: 45_000,
  queryHits: 1,
  isShort: false,
});

const staleTopic = scoreTrend({
  views: 500_000,
  likes: 32_000,
  comments: 3_200,
  ageHours: 160,
  subscribers: 20_000,
  channelAverageViews: 5_000,
  previousViewsPerHour: 8_000,
  queryHits: 1,
  isShort: false,
});

if (emergingOutlier.opportunity <= largeChannelRoutine.opportunity) {
  throw new Error("Emerging channel outlier should outrank routine large-channel performance");
}
if (emergingOutlier.opportunity <= staleTopic.opportunity) {
  throw new Error("Fresh accelerating signal should outrank a stale topic");
}
if (emergingOutlier.outlierScore < 50) {
  throw new Error("Expected a strong channel-relative outlier");
}
if (![emergingOutlier, largeChannelRoutine, staleTopic].every((item) => item.opportunity >= 0 && item.opportunity <= 100)) {
  throw new Error("Opportunity score escaped the 0–100 contract");
}

console.log(JSON.stringify({
  passed: true,
  emergingOutlier: Math.round(emergingOutlier.opportunity),
  largeChannelRoutine: Math.round(largeChannelRoutine.opportunity),
  staleTopic: Math.round(staleTopic.opportunity),
  outlierMultiple: Math.round(emergingOutlier.outlierScore),
}));
