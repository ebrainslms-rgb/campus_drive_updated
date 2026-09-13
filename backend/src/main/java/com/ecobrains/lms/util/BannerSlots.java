package com.ecobrains.lms.util;

import java.util.ArrayList;
import java.util.List;

/** Canonical set of valid banner slot keys - one hero banner (single big
 *  image, left side of the Rules page), and a fixed maximum of 8 poster
 *  slots (right side, after the timer). "Fixed max, but only render what's
 *  actually filled" - admin can upload just 1, or all 8, and the
 *  student-facing carousel shows exactly that many, never blank
 *  placeholders for the empty ones. */
public final class BannerSlots {

    public static final String HERO = "HERO";

    public static final List<String> POSTER_SLOTS = List.of(
            "POSTER_1", "POSTER_2", "POSTER_3", "POSTER_4",
            "POSTER_5", "POSTER_6", "POSTER_7", "POSTER_8"
    );

    public static final List<String> ALL_SLOTS;

    static {
        List<String> all = new ArrayList<>();
        all.add(HERO);
        all.addAll(POSTER_SLOTS);
        ALL_SLOTS = List.copyOf(all);
    }

    public static boolean isValid(String slot) {
        return ALL_SLOTS.contains(slot);
    }

    private BannerSlots() {}
}
