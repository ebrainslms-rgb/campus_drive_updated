package com.ecobrains.lms.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "registration_fields", uniqueConstraints = @UniqueConstraint(name = "uk_registration_field_key", columnNames = "field_key"))
public class RegistrationField {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "field_key", nullable = false, length = 80) private String fieldKey;
    @Column(nullable = false, length = 120) private String label;
    @Column(nullable = false, length = 20) private String type;
    @Column(nullable = false) private boolean required = false;
    @Column(nullable = false) private boolean enabled = true;
    @Column(name = "options_json", columnDefinition = "TEXT") private String optionsJson;
    @Column(name = "sort_order", nullable = false) private int sortOrder = 0;
    public RegistrationField() {}
    public Long getId(){return id;} public void setId(Long v){id=v;}
    public String getFieldKey(){return fieldKey;} public void setFieldKey(String v){fieldKey=v;}
    public String getLabel(){return label;} public void setLabel(String v){label=v;}
    public String getType(){return type;} public void setType(String v){type=v;}
    public boolean isRequired(){return required;} public void setRequired(boolean v){required=v;}
    public boolean isEnabled(){return enabled;} public void setEnabled(boolean v){enabled=v;}
    public String getOptionsJson(){return optionsJson;} public void setOptionsJson(String v){optionsJson=v;}
    public int getSortOrder(){return sortOrder;} public void setSortOrder(int v){sortOrder=v;}
}
