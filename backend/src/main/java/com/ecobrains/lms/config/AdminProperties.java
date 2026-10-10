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
        this.username = clean(username);
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        // Only strip line-ending characters (e.g. a Windows CRLF .env file);
        // leading/trailing spaces could be a deliberate part of a password.
        this.password = password == null ? null : password.replaceAll("[\\r\\n]+$", "").replaceAll("^[\\r\\n]+", "");
    }

    public String getUrlKey() {
        return urlKey;
    }

    public void setUrlKey(String urlKey) {
        this.urlKey = clean(urlKey);
    }

    /** Removes surrounding whitespace, including a stray \r from CRLF .env files. */
    private static String clean(String value) {
        return value == null ? null : value.strip();
    }
}
