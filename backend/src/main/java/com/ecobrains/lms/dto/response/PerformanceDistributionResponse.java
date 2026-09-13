package com.ecobrains.lms.dto.response;

/** Percentage-based performance buckets - analytics only, not an official pass/fail rule. */
public record PerformanceDistributionResponse(
        long excellent,   // >= 80%
        long good,        // 60-79%
        long average,     // 40-59%
        long belowAverage,// 20-39%
        long poor,        // < 20%
        long totalScored
) {
    public static PerformanceDistributionResponse zero() {
        return new PerformanceDistributionResponse(0, 0, 0, 0, 0, 0);
    }
}
