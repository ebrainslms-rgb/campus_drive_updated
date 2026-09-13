package com.ecobrains.lms.util;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.function.Function;

/**
 * Thin wrapper around POI's streaming (SXSSF) workbook - keeps memory bounded
 * even for larger filtered result sets by flushing rows to disk as they're
 * written, rather than holding the whole sheet in memory (the default XSSFWorkbook).
 */
public final class ExcelWriter {

    private ExcelWriter() {}

    public static <T> byte[] write(String sheetName, List<String> headers, List<T> rows,
                                    Function<T, Object[]> rowMapper) {
        try (SXSSFWorkbook workbook = new SXSSFWorkbook(100)) { // keep 100 rows in memory at a time
            SXSSFSheet sheet = workbook.createSheet(sheetName);

            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);

            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.size(); i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers.get(i));
                cell.setCellStyle(headerStyle);
            }

            int rowIdx = 1;
            for (T item : rows) {
                Row row = sheet.createRow(rowIdx++);
                Object[] values = rowMapper.apply(item);
                for (int i = 0; i < values.length; i++) {
                    setCellValue(row.createCell(i), values[i]);
                }
            }

            for (int i = 0; i < headers.size(); i++) {
                sheet.trackColumnForAutoSizing(i);
                sheet.autoSizeColumn(i);
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            workbook.dispose(); // clean up temp files backing the streaming workbook
            return out.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException("Failed to generate Excel export.", e);
        }
    }

    private static void setCellValue(Cell cell, Object value) {
        if (value == null) {
            cell.setBlank();
        } else if (value instanceof Number n) {
            cell.setCellValue(n.doubleValue());
        } else if (value instanceof Boolean b) {
            cell.setCellValue(b);
        } else {
            cell.setCellValue(value.toString());
        }
    }
}
