package com.ecobrains.lms.service;

import com.ecobrains.lms.dto.request.RegistrationFieldRequest;
import com.ecobrains.lms.dto.response.RegistrationFieldResponse;
import com.ecobrains.lms.entity.RegistrationField;
import com.ecobrains.lms.entity.Student;
import com.ecobrains.lms.entity.StudentRegistrationValue;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.RegistrationFieldRepository;
import com.ecobrains.lms.repository.StudentRegistrationValueRepository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class RegistrationFieldService {
    private final RegistrationFieldRepository fields;
    private final StudentRegistrationValueRepository values;
    private final ObjectMapper mapper;

    public RegistrationFieldService(RegistrationFieldRepository fields, StudentRegistrationValueRepository values, ObjectMapper mapper) {
        this.fields = fields; this.values = values; this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public List<RegistrationFieldResponse> list(boolean enabledOnly) {
        return (enabledOnly ? fields.findAllByEnabledTrueOrderBySortOrderAscIdAsc() : fields.findAllByOrderBySortOrderAscIdAsc())
                .stream().map(this::response).toList();
    }

    @Transactional(readOnly = true)
    public Map<String, String> valuesForStudent(Long studentId) {
        return values.findByStudentId(studentId).stream().collect(Collectors.toMap(StudentRegistrationValue::getFieldKey, StudentRegistrationValue::getValue, (a,b)->b, LinkedHashMap::new));
    }

    @Transactional(readOnly = true)
    public Map<Long, Map<String, String>> valuesForStudents(List<Long> studentIds) {
        Map<Long, Map<String, String>> result = new HashMap<>();
        for (StudentRegistrationValue value : values.findByStudentIdIn(studentIds)) {
            result.computeIfAbsent(value.getStudent().getId(), k -> new LinkedHashMap<>()).put(value.getFieldKey(), value.getValue());
        }
        return result;
    }

    @Transactional
    public RegistrationFieldResponse create(RegistrationFieldRequest request) {
        String label = request.label().trim();
        String key = makeKey(label);
        if (fields.findByFieldKey(key).isPresent()) key = key + "_" + System.currentTimeMillis();
        RegistrationField field = new RegistrationField();
        field.setFieldKey(key); field.setLabel(label); field.setType(normalizeType(request.type())); field.setRequired(request.required()); field.setEnabled(request.enabled()); field.setOptionsJson(toJson(request.options())); field.setSortOrder(request.sortOrder() == null ? (int) fields.count() : request.sortOrder());
        return response(fields.save(field));
    }

    @Transactional
    public RegistrationFieldResponse update(Long id, RegistrationFieldRequest request) {
        RegistrationField field = fields.findById(id).orElseThrow(() -> ApiException.notFound("Registration field not found."));
        field.setLabel(request.label().trim());
        field.setType(normalizeType(request.type()));
        field.setRequired(request.required());
        field.setEnabled(request.enabled());
        field.setOptionsJson(toJson(request.options()));
        if (request.sortOrder() != null) field.setSortOrder(request.sortOrder());
        return response(fields.save(field));
    }

    @Transactional
    public void delete(Long id) {
        RegistrationField field = fields.findById(id).orElseThrow(() -> ApiException.notFound("Registration field not found."));
        values.deleteByFieldKey(field.getFieldKey());
        fields.delete(field);
    }

    @Transactional
    public void validateAndSave(Student student, Map<String, String> submitted) {
        Map<String, String> data = submitted == null ? Map.of() : submitted;
        for (RegistrationField field : fields.findAllByEnabledTrueOrderBySortOrderAscIdAsc()) {
            String value = data.get(field.getFieldKey());
            if (field.isRequired() && (value == null || value.isBlank())) throw ApiException.badRequest(field.getLabel() + " is required.");
            if (value != null && !value.isBlank() && "DROPDOWN".equals(field.getType()) && !options(field).contains(value)) throw ApiException.badRequest("Invalid value for " + field.getLabel() + ".");
        }
        values.deleteByStudentId(student.getId());
        for (RegistrationField field : fields.findAllByEnabledTrueOrderBySortOrderAscIdAsc()) {
            String value = data.get(field.getFieldKey());
            if (value != null && !value.isBlank()) { StudentRegistrationValue row = new StudentRegistrationValue(); row.setStudent(student); row.setFieldKey(field.getFieldKey()); row.setValue(value.trim()); values.save(row); }
        }
    }

    private RegistrationFieldResponse response(RegistrationField field) { return new RegistrationFieldResponse(field.getId(), field.getFieldKey(), field.getLabel(), field.getType(), field.isRequired(), field.isEnabled(), options(field), field.getSortOrder()); }
    private List<String> options(RegistrationField field) { if (field.getOptionsJson() == null || field.getOptionsJson().isBlank()) return List.of(); try { return mapper.readValue(field.getOptionsJson(), new TypeReference<List<String>>() {}); } catch (Exception e) { return List.of(); } }
    private String toJson(List<String> options) { try { return mapper.writeValueAsString(options == null ? List.of() : options.stream().map(String::trim).filter(s -> !s.isBlank()).distinct().toList()); } catch (Exception e) { throw ApiException.badRequest("Invalid dropdown options."); } }
    private String normalizeType(String type) { String v = type == null ? "TEXT" : type.trim().toUpperCase(); if (!Set.of("TEXT","NUMBER","DATE","DROPDOWN").contains(v)) throw ApiException.badRequest("Unsupported registration field type."); return v; }
    private String makeKey(String label) { String key = label.toUpperCase().replaceAll("[^A-Z0-9]+", "_").replaceAll("^_+|_+$", ""); return key.isBlank() ? "FIELD_" + System.currentTimeMillis() : key; }
}
