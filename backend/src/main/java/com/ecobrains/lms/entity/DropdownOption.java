package com.ecobrains.lms.entity;

import jakarta.persistence.*;
import lombok.*;

/** One admin-managed option within a named dropdown list (e.g. listKey
 *  "DOMAIN" holding "ECE", "ISE", ...). displayOrder controls the order
 *  shown to students; admin can add/remove/reorder freely from the
 *  Registration Page Content admin screen - no code change needed to add
 *  a new branch, qualification, or passing-year option ever again. */
@Entity
@Table(name = "dropdown_options")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DropdownOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "list_key", length = 40, nullable = false)
    private String listKey;

    @Column(nullable = false, length = 255)
    private String value;

    @Column(name = "display_order")
    @Builder.Default
    private Integer displayOrder = 0;
}
