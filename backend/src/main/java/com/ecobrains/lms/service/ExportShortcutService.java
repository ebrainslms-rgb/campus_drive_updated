package com.ecobrains.lms.service;

import com.ecobrains.lms.entity.ExportShortcut;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.ExportShortcutRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Personal export shortcuts: create and delete only, up to 5 per person per
 * export type. Nobody sees another person's shortcuts.
 */
@Service
public class ExportShortcutService {

    public static final int MAX_PER_TYPE = 5;
    /** Starts with a letter; letters, numbers, spaces, - and _ ; 2–30 characters. */
    private static final Pattern NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9 _-]{1,29}$");

    public record ShortcutView(Long id, String name, List<String> columns) {}

    private final ExportShortcutRepository shortcuts;
    private final ExportColumnsService exportColumns;

    public ExportShortcutService(ExportShortcutRepository shortcuts, ExportColumnsService exportColumns) {
        this.shortcuts = shortcuts;
        this.exportColumns = exportColumns;
    }

    /** The owner's shortcuts. Deleted registration fields are skipped from each column list. */
    @Transactional(readOnly = true)
    public List<ShortcutView> list(Long ownerId, ExportColumnsService.ExportType type) {
        Map<String, String> catalog = exportColumns.catalog(type);
        return shortcuts.findByOwnerIdAndExportTypeOrderByCreatedAtAscIdAsc(owner(ownerId), type.name()).stream()
                .map(s -> new ShortcutView(s.getId(), s.getName(),
                        ExportColumnsService.split(s.getColumns()).stream().filter(catalog::containsKey).distinct().toList()))
                .toList();
    }

    @Transactional
    public ShortcutView create(Long ownerId, ExportColumnsService.ExportType type, String rawName, List<String> rawColumns) {
        Long owner = owner(ownerId);
        String name = rawName == null ? "" : rawName.strip().replaceAll("\\s+", " ");
        if (!NAME.matcher(name).matches()) {
            throw ApiException.badRequest("Shortcut name must start with a letter and use only letters, numbers, spaces, - or _ (2 to 30 characters).");
        }
        Map<String, String> catalog = exportColumns.catalog(type);
        List<String> columns = rawColumns == null ? List.of() : rawColumns.stream()
                .filter(Objects::nonNull).map(String::strip).filter(catalog::containsKey).distinct().toList();
        if (columns.isEmpty()) throw ApiException.badRequest("Select at least one column before saving a shortcut.");
        if (shortcuts.countByOwnerIdAndExportType(owner, type.name()) >= MAX_PER_TYPE) {
            throw ApiException.badRequest("You can keep up to " + MAX_PER_TYPE + " shortcuts here. Delete one to save a new one.");
        }
        String key = name.toLowerCase(Locale.ROOT);
        if (shortcuts.existsByOwnerIdAndExportTypeAndNameKey(owner, type.name(), key)) {
            throw ApiException.conflict("You already have a shortcut named \"" + name + "\".");
        }
        ExportShortcut s = new ExportShortcut();
        s.setOwnerId(owner);
        s.setExportType(type.name());
        s.setName(name);
        s.setNameKey(key);
        s.setColumns(String.join(",", columns));
        s = shortcuts.save(s);
        return new ShortcutView(s.getId(), s.getName(), columns);
    }

    @Transactional
    public void delete(Long ownerId, Long id) {
        ExportShortcut s = shortcuts.findById(id).orElse(null);
        // Someone else's shortcut is reported exactly like a missing one.
        if (s == null || !s.getOwnerId().equals(owner(ownerId))) throw ApiException.notFound("Shortcut not found.");
        shortcuts.delete(s);
    }

    private static Long owner(Long ownerId) {
        if (ownerId == null) throw ApiException.unauthorized("Please log in again.");
        return ownerId;
    }
}
