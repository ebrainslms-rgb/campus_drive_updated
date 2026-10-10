package com.ecobrains.lms.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "student_registration_values", uniqueConstraints = @UniqueConstraint(name = "uk_student_registration_value", columnNames = {"student_id", "field_key"}))
public class StudentRegistrationValue {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "student_id", nullable = false) private Student student;
    @Column(name = "field_key", nullable = false, length = 80) private String fieldKey;
    @Column(columnDefinition = "TEXT") private String value;
    public StudentRegistrationValue() {}
    public Long getId(){return id;} public void setId(Long v){id=v;}
    public Student getStudent(){return student;} public void setStudent(Student v){student=v;}
    public String getFieldKey(){return fieldKey;} public void setFieldKey(String v){fieldKey=v;}
    public String getValue(){return value;} public void setValue(String v){value=v;}
}
