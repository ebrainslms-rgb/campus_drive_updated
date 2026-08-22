package com.ecobrains.lms.dto.response;

/** One editable text field in the admin Registration Page Content screen -
 *  the key, its current effective value (DB override if present, else the
 *  original default), and whether it's currently overridden. */
public record SiteContentFieldResponse(String key, String label, String value, boolean isCustom) {}
