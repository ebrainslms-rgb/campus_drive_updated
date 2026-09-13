package com.ecobrains.lms.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Backs @EnableCaching with an actual cache store. ConcurrentMapCacheManager
 * is Spring's simplest built-in option - plain in-memory maps living inside
 * this same running process, no new service, no Redis, nothing to install
 * or monitor separately. Exactly right for a single-instance deployment
 * like this one; see LmsBackendApplication and QuestionService for where
 * @EnableCaching/@Cacheable/@CacheEvict actually use this.
 *
 * "courseQuestions" is the only cache name currently in use - caches each
 * course's question list, keyed by courseId, evicted the moment that
 * course's questions are actually re-uploaded (see QuestionService.upload()).
 */
@Configuration
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        return new ConcurrentMapCacheManager("courseQuestions");
    }
}
