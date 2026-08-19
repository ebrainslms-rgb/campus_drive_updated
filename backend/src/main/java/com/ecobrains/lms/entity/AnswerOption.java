package com.ecobrains.lms.entity;

/** A/B/C/D option letter, and the 0-based index used when a student selects an option. */
public enum AnswerOption {
    A(0), B(1), C(2), D(3);

    private final int index;

    AnswerOption(int index) {
        this.index = index;
    }

    public int index() {
        return index;
    }

    public static AnswerOption fromIndex(Integer index) {
        if (index == null) return null;
        for (AnswerOption o : values()) {
            if (o.index == index) return o;
        }
        throw new IllegalArgumentException("Invalid option index: " + index);
    }
}
