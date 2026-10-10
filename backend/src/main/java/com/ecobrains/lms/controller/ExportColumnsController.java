package com.ecobrains.lms.controller;

import com.ecobrains.lms.security.CurrentUser;
import com.ecobrains.lms.service.ExportColumnsService;
import com.ecobrains.lms.service.ExportShortcutService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Export popup data: available columns + defaults per export type, and the
 * logged-in person's own shortcuts. Open to the admin and every portal user.
 */
@RestController
@RequestMapping("/api/admin")
public class ExportColumnsController {

    private final ExportColumnsService exportColumns;
    private final ExportShortcutService shortcuts;

    public ExportColumnsController(ExportColumnsService exportColumns, ExportShortcutService shortcuts) {
        this.exportColumns = exportColumns;
        this.shortcuts = shortcuts;
    }

    /** type=STUDENTS|DRIVE; the filter flags decide whether College/Course are default columns. */
    @GetMapping("/export-columns")
    public ResponseEntity<Map<String, Object>> columns(@RequestParam String type,
                                                       @RequestParam(defaultValue = "false") boolean courseFiltered,
                                                       @RequestParam(defaultValue = "false") boolean collegeFiltered) {
        ExportColumnsService.ExportType t = ExportColumnsService.ExportType.parse(type);
        List<Map<String, String>> fields = new ArrayList<>();
        exportColumns.catalog(t).forEach((key, label) -> fields.add(Map.of("key", key, "label", label)));
        boolean college = t == ExportColumnsService.ExportType.DRIVE || collegeFiltered;
        return ResponseEntity.ok(Map.of(
                "fields", fields,
                "defaults", exportColumns.defaults(t, courseFiltered, college),
                "maxShortcuts", ExportShortcutService.MAX_PER_TYPE));
    }

    @GetMapping("/export-shortcuts")
    public ResponseEntity<List<ExportShortcutService.ShortcutView>> list(@RequestParam String type) {
        return ResponseEntity.ok(shortcuts.list(CurrentUser.get().userId(), ExportColumnsService.ExportType.parse(type)));
    }

    public record CreateShortcutRequest(String type, String name, List<String> columns) {}

    @PostMapping("/export-shortcuts")
    public ResponseEntity<ExportShortcutService.ShortcutView> create(@RequestBody CreateShortcutRequest body) {
        return ResponseEntity.ok(shortcuts.create(CurrentUser.get().userId(),
                ExportColumnsService.ExportType.parse(body.type()), body.name(), body.columns()));
    }

    @DeleteMapping("/export-shortcuts/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        shortcuts.delete(CurrentUser.get().userId(), id);
        return ResponseEntity.noContent().build();
    }
}
