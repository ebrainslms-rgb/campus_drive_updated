package com.ecobrains.lms.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Admin credentials, bound from application.properties (app.admin.*).
 * Never hard-coded in source, never logged, never exposed to the frontend.
 */
@ConfigurationProperties(prefix = "app.admin")
public class AdminProperties {

    private String username;
    private String password;
    /** Extra shared secret required alongside the JWT on every admin API call. */
    private String urlKey;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getUrlKey() {
        return urlKey;
    }

    public void setUrlKey(String urlKey) {
        this.urlKey = urlKey;
    }
}
