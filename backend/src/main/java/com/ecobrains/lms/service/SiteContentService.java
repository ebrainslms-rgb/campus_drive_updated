package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.response.SiteContentFieldResponse;
import com.ecobrains.lms.entity.SiteContent;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.SiteContentRepository;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Generic admin-editable key/value text, backed by one shared table
 * (SiteContent) but organised into three independent groups, each with
 * its own labels/defaults map and its own admin page - the underlying
 * storage is shared (no reason to duplicate a table for a handful of
 * scalar values), but "brand panel text", "exam settings", and "batch
 * update toggles" never mix in the same admin screen or API response.
 * Defaults below are exactly the original hardcoded values - nothing
 * changes for anyone until an admin actually edits a field.
 */
@Service
public class SiteContentService {

    // ---- Group 1: shared Register/Login brand panel text ----
    private static final Map<String, String> BRAND_LABELS = new LinkedHashMap<>();
    private static final Map<String, String> BRAND_DEFAULTS = new LinkedHashMap<>();
    static {
        BRAND_LABELS.put("BRAND_TITLE", "Heading");
        BRAND_LABELS.put("BRAND_SUBTITLE", "Subheading");
        BRAND_LABELS.put("FEATURE_1_TITLE", "Feature 1 - Title");
        BRAND_LABELS.put("FEATURE_1_DESC", "Feature 1 - Description");
        BRAND_LABELS.put("FEATURE_2_TITLE", "Feature 2 - Title");
        BRAND_LABELS.put("FEATURE_2_DESC", "Feature 2 - Description");
        BRAND_LABELS.put("FEATURE_3_TITLE", "Feature 3 - Title");
        BRAND_LABELS.put("FEATURE_3_DESC", "Feature 3 - Description");

        BRAND_DEFAULTS.put("BRAND_TITLE", "Assessment Portal");
        BRAND_DEFAULTS.put("BRAND_SUBTITLE", "Your path to placement starts here");
        BRAND_DEFAULTS.put("FEATURE_1_TITLE", "Java Full Stack Training");
        BRAND_DEFAULTS.put("FEATURE_1_DESC", "Industry-aligned curriculum covering Core Java, Spring Boot, React and MySQL.");
        BRAND_DEFAULTS.put("FEATURE_2_TITLE", "Campus Placement Drives");
        BRAND_DEFAULTS.put("FEATURE_2_DESC", "Regular examination drives conducted across partner engineering colleges.");
        BRAND_DEFAULTS.put("FEATURE_3_TITLE", "Hands-on Assessment");
        BRAND_DEFAULTS.put("FEATURE_3_DESC", "Structured aptitude, logical, frontend and programming evaluation.");
    }

    // ---- Group 2: exam behaviour settings ----
    private static final Map<String, String> EXAM_SETTING_LABELS = new LinkedHashMap<>();
    private static final Map<String, String> EXAM_SETTING_DEFAULTS = new LinkedHashMap<>();
    static {
        EXAM_SETTING_LABELS.put("MANUAL_SUBMIT_WINDOW_MINUTES", "Manual Submit Window (minutes before exam end)");
        EXAM_SETTING_DEFAULTS.put("MANUAL_SUBMIT_WINDOW_MINUTES", "5");
    }

    private final SiteContentRepository siteContentRepository;

    public SiteContentService(SiteContentRepository siteContentRepository) {
        this.siteContentRepository = siteContentRepository;
    }

    // ================= shared generic helpers =================

    private Map<String, String> effectiveValues(Map<String, String> labels, Map<String, String> defaults) {
        Map<String, String> overrides = new HashMap<>();
        for (SiteContent c : siteContentRepository.findAllById(labels.keySet())) {
            overrides.put(c.getKey(), c.getValue());
        }
        Map<String, String> result = new LinkedHashMap<>();
        for (String key : labels.keySet()) {
            result.put(key, overrides.getOrDefault(key, defaults.get(key)));
        }
        return result;
    }

    private List<SiteContentFieldResponse> listForAdmin(Map<String, String> labels, Map<String, String> defaults) {
        Map<String, String> overrides = new HashMap<>();
        for (SiteContent c : siteContentRepository.findAllById(labels.keySet())) {
            overrides.put(c.getKey(), c.getValue());
        }
        List<SiteContentFieldResponse> result = new ArrayList<>();
        for (String key : labels.keySet()) {
            boolean isCustom = overrides.containsKey(key);
            result.add(new SiteContentFieldResponse(
                    key, labels.get(key), overrides.getOrDefault(key, defaults.get(key)), isCustom));
        }
        return result;
    }

    private void update(Map<String, String> labels, String key, String value) {
        if (!labels.containsKey(key)) {
            throw ApiException.badRequest("Unknown content field: " + key);
        }
        if (value == null || value.isBlank()) {
            throw ApiException.badRequest("Value cannot be empty.");
        }
        SiteContent content = siteContentRepository.findById(key)
                .orElse(SiteContent.builder().key(key).build());
        content.setValue(value.trim());
        siteContentRepository.save(content);
    }

    private void resetToDefault(Map<String, String> labels, String key) {
        if (!labels.containsKey(key)) {
            throw ApiException.badRequest("Unknown content field: " + key);
        }
        siteContentRepository.deleteById(key);
    }

    // ================= Group 1: brand panel text =================

    public Map<String, String> getAllForPublic() {
        return effectiveValues(BRAND_LABELS, BRAND_DEFAULTS);
    }

    public List<SiteContentFieldResponse> listForAdmin() {
        return listForAdmin(BRAND_LABELS, BRAND_DEFAULTS);
    }

    public void update(String key, String value) {
        update(BRAND_LABELS, key, value);
    }

    public void resetToDefault(String key) {
        resetToDefault(BRAND_LABELS, key);
    }

    // ================= Group 2: exam settings =================

    public List<SiteContentFieldResponse> listExamSettingsForAdmin() {
        return listForAdmin(EXAM_SETTING_LABELS, EXAM_SETTING_DEFAULTS);
    }

        public void updateExamSetting(String key, String value) {
        if ("MANUAL_SUBMIT_WINDOW_MINUTES".equals(key)) {
            try {
                int minutes = Integer.parseInt(value.trim());
                if (minutes < 1 || minutes > 30) {
                    throw ApiException.badRequest("Manual submit window must be between 1 and 30 minutes.");
                }
            } catch (NumberFormatException e) {
                throw ApiException.badRequest("Manual submit window must be a whole number.");
            }
        }
        update(EXAM_SETTING_LABELS, key, value);
    }

    public void resetExamSettingToDefault(String key) {
        resetToDefault(EXAM_SETTING_LABELS, key);
    }

    /** Public - the exam page reads this to know how many minutes before
     *  the end the manual submit button should become available. */
    public int getManualSubmitWindowMinutes() {
        String raw = effectiveValues(EXAM_SETTING_LABELS, EXAM_SETTING_DEFAULTS).get("MANUAL_SUBMIT_WINDOW_MINUTES");
        try {
            int minutes = Integer.parseInt(raw.trim());
            return (minutes >= 1 && minutes <= 30) ? minutes : 5;
        } catch (Exception e) {
            return 5; // never let a bad stored value break the exam page
        }
    }
}
