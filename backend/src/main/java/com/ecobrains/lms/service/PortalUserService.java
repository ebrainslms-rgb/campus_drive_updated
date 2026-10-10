package com.ecobrains.lms.service;

import com.ecobrains.lms.config.AdminProperties;
import com.ecobrains.lms.dto.request.PortalUserRequest;
import com.ecobrains.lms.dto.response.PortalUserResponse;
import com.ecobrains.lms.entity.PortalUser;
import com.ecobrains.lms.entity.PortalUserPermission;
import com.ecobrains.lms.exception.ApiException;
import com.ecobrains.lms.repository.PortalUserPermissionRepository;
import com.ecobrains.lms.repository.PortalUserRepository;
import com.ecobrains.lms.security.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class PortalUserService {
    private static final Logger log = LoggerFactory.getLogger(PortalUserService.class);

    public static final List<String> PERMISSION_KEYS = List.of("STUDENT", "COURSE", "QUESTION", "EXAM_DRIVE");
    private static final int MIN_PASSWORD_LENGTH = 6;
    /**
     * The ONLY message either login tab ever returns for a failed login. It never
     * reveals whether the email exists, which tab it belongs to, or which part was wrong.
     */
    public static final String INVALID_LOGIN = "Invalid email or password.";

    private final PortalUserRepository users;
    private final PortalUserPermissionRepository permissions;
    private final PasswordEncoder encoder;
    private final AdminProperties adminProperties;
    private final JwtService jwt;

    public PortalUserService(PortalUserRepository users, PortalUserPermissionRepository permissions, PasswordEncoder encoder, AdminProperties adminProperties, JwtService jwt) {
        this.users = users; this.permissions = permissions; this.encoder = encoder; this.adminProperties = adminProperties; this.jwt = jwt;
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }

    /**
     * Creates or synchronizes the configured Admin account on every startup, and
     * backfills any missing permission rows for portal users.
     */
    @Transactional
    public void ensureAdmin() {
        String email = normalizeEmail(adminProperties.getUsername());
        String password = adminProperties.getPassword();
        if (email.isBlank() || password == null || password.isBlank()) {
            log.warn("Admin credentials are not configured (APP_ADMIN_USERNAME / APP_ADMIN_PASSWORD). Admin login is disabled.");
            return;
        }

        PortalUser admin = users.findByEmailIgnoreCase(email).orElse(null);
        if (admin == null) {
            users.save(PortalUser.builder().name("Administrator").email(email)
                    .passwordHash(encoder.encode(password)).role("ADMIN").active(true).build());
            log.info("Created Admin account for {}", email);
        } else {
            boolean changed = false;
            if (!"ADMIN".equals(admin.getRole())) { admin.setRole("ADMIN"); changed = true; }
            if (!admin.isActive()) { admin.setActive(true); changed = true; }
            if (!email.equals(admin.getEmail())) { admin.setEmail(email); changed = true; }
            if (admin.getPasswordHash() == null || !encoder.matches(password, admin.getPasswordHash())) {
                admin.setPasswordHash(encoder.encode(password));
                changed = true;
            }
            if (changed) {
                users.save(admin);
                log.info("Synchronized Admin account for {}", email);
            }
            // The admin never carries per-area permission rows.
            List<PortalUserPermission> adminRows = permissions.findByUserId(admin.getId());
            if (!adminRows.isEmpty()) permissions.deleteAll(adminRows);
        }

        // Backfill permission rows for every portal user (independent of the admin branch above).
        for (PortalUser user : users.findAll()) {
            if (!"USER".equals(user.getRole())) continue;
            List<PortalUserPermission> existing = permissions.findByUserId(user.getId());
            List<PortalUserPermission> unknown = existing.stream().filter(p -> !PERMISSION_KEYS.contains(p.getPermissionKey())).toList();
            if (!unknown.isEmpty()) permissions.deleteAll(unknown);
            for (String key : PERMISSION_KEYS) {
                boolean exists = existing.stream().anyMatch(p -> key.equals(p.getPermissionKey()));
                if (!exists) upsertPermission(user, key, true, false, null, existing);
            }
        }
    }

    @Transactional(readOnly = true)
    public PortalUser authenticateConfiguredAdmin(String email, String password) {
        String configuredEmail = normalizeEmail(adminProperties.getUsername());
        String loginEmail = normalizeEmail(email);
        String loginPassword = password == null ? "" : password;

        PortalUser admin = configuredEmail.isBlank() || !configuredEmail.equals(loginEmail)
                ? null
                : users.findByEmailIgnoreCase(configuredEmail).orElse(null);

        // Always run one password check, even when the email is wrong, so the
        // response time does not reveal whether the email is the admin's.
        boolean passwordOk = checkPassword(loginPassword, admin == null ? null : admin.getPasswordHash());
        if (admin == null || !passwordOk || !admin.isActive() || !"ADMIN".equals(admin.getRole())) {
            throw ApiException.unauthorized(INVALID_LOGIN);
        }
        return admin;
    }

    @Transactional(readOnly = true)
    public PortalUser authenticateRole(String email, String password, String role) {
        String loginEmail = normalizeEmail(email);
        String loginPassword = password == null ? "" : password;
        PortalUser u = loginEmail.isBlank() ? null : users.findByEmailIgnoreCase(loginEmail).orElse(null);

        // Same generic answer for: unknown email, wrong password, and an account
        // that belongs to the other tab (e.g. the admin email on the User tab).
        boolean passwordOk = checkPassword(loginPassword, u == null ? null : u.getPasswordHash());
        if (u == null || !passwordOk || !role.equals(u.getRole())) {
            throw ApiException.unauthorized(INVALID_LOGIN);
        }
        // Only someone who already proved the password is told the account is inactive.
        if (!u.isActive()) throw ApiException.unauthorized("Your account is inactive. Please contact the administrator.");
        return u;
    }

    /** A fixed BCrypt hash used to spend the same time when there is no real hash to check. */
    private volatile String dummyHash;

    private boolean checkPassword(String raw, String hash) {
        if (hash == null) {
            if (dummyHash == null) dummyHash = encoder.encode("timing-equaliser-not-a-real-password");
            encoder.matches(raw, dummyHash);
            return false;
        }
        return !raw.isEmpty() && encoder.matches(raw, hash);
    }

    @Transactional(readOnly = true)
    public PortalUser findActiveRole(Long id, String role) {
        PortalUser u = findActive(id);
        if (!role.equals(u.getRole())) throw ApiException.unauthorized("Invalid session.");
        return u;
    }

    @Transactional(readOnly = true)
    public String token(PortalUser u) { return jwt.generatePortalToken(u.getId(), u.getEmail(), u.getRole(), permissionClaims(u)); }

    @Transactional(readOnly = true)
    public PortalUser findActive(Long id) {
        if (id == null) throw ApiException.unauthorized("Session is no longer valid.");
        PortalUser u = users.findById(id).orElseThrow(() -> ApiException.unauthorized("Session is no longer valid."));
        if (!u.isActive()) throw ApiException.unauthorized("Your user account is inactive.");
        return u;
    }

    private Map<String, Object> permissionClaims(PortalUser u) {
        Map<String, Object> m = new LinkedHashMap<>();
        if ("ADMIN".equals(u.getRole())) { m.put("ADMIN", List.of("READ", "MODIFY")); return m; }
        for (PortalUserPermission p : permissions.findByUserId(u.getId())) {
            if (!PERMISSION_KEYS.contains(p.getPermissionKey())) continue;
            List<String> a = new ArrayList<>();
            if (p.isReadAccess() || p.isModifyAccess()) a.add("READ");
            if (p.isModifyAccess()) a.add("MODIFY");
            m.put(p.getPermissionKey(), a);
        }
        // Drive Control implies Student access (the backend enforces the same rule in has()).
        List<?> drive = (List<?>) m.getOrDefault("EXAM_DRIVE", List.of());
        List<?> student = (List<?>) m.getOrDefault("STUDENT", List.of());
        if (drive.size() > student.size()) m.put("STUDENT", drive);
        m.put("DASHBOARD", List.of("READ"));
        return m;
    }

    @Transactional(readOnly = true)
    public List<PortalUserResponse> list() {
        return users.findAll().stream()
                .filter(u -> !"ADMIN".equals(u.getRole()))
                .sorted(Comparator.comparing(PortalUser::getId))
                .map(this::toResponse).toList();
    }

    @Transactional
    public PortalUserResponse create(PortalUserRequest r) {
        String email = normalizeEmail(r.email());
        if (email.equals(normalizeEmail(adminProperties.getUsername()))) throw ApiException.conflict("This email belongs to the Admin account.");
        if (users.existsByEmailIgnoreCase(email)) throw ApiException.conflict("A user with this email already exists.");
        if (r.password() == null || r.password().length() < MIN_PASSWORD_LENGTH) throw ApiException.badRequest("Password must contain at least " + MIN_PASSWORD_LENGTH + " characters.");
        PortalUser u = users.save(PortalUser.builder().name(r.name().strip()).email(email)
                .passwordHash(encoder.encode(r.password())).role("USER")
                .active(r.active() == null || r.active()).build());
        savePermissions(u, r.permissions());
        return toResponse(u);
    }

    @Transactional
    public PortalUserResponse update(Long id, PortalUserRequest r) {
        PortalUser u = users.findById(id).orElseThrow(() -> ApiException.notFound("User not found."));
        if ("ADMIN".equals(u.getRole())) throw ApiException.badRequest("The primary Admin account cannot be edited here.");
        String email = normalizeEmail(r.email());
        if (email.equals(normalizeEmail(adminProperties.getUsername()))) throw ApiException.conflict("This email belongs to the Admin account.");
        users.findByEmailIgnoreCase(email).ifPresent(x -> { if (!x.getId().equals(id)) throw ApiException.conflict("A user with this email already exists."); });
        u.setName(r.name().strip());
        u.setEmail(email);
        if (r.password() != null && !r.password().isBlank()) {
            if (r.password().length() < MIN_PASSWORD_LENGTH) throw ApiException.badRequest("Password must contain at least " + MIN_PASSWORD_LENGTH + " characters.");
            u.setPasswordHash(encoder.encode(r.password()));
        }
        if (r.active() != null) u.setActive(r.active());
        users.save(u);
        // Update permission rows in place. Deleting and re-inserting in the same
        // transaction fails: Hibernate flushes INSERTs before DELETEs, which
        // violates the (user_id, permission_key) unique constraint.
        savePermissions(u, r.permissions());
        return toResponse(u);
    }

    @Transactional
    public void delete(Long id) {
        PortalUser u = users.findById(id).orElseThrow(() -> ApiException.notFound("User not found."));
        if ("ADMIN".equals(u.getRole())) throw ApiException.badRequest("The primary Admin account cannot be deleted.");
        List<PortalUserPermission> rows = permissions.findByUserId(id);
        if (!rows.isEmpty()) {
            permissions.deleteAll(rows);
            permissions.flush();
        }
        users.delete(u);
    }

    @Transactional(readOnly = true)
    public boolean isActive(Long userId) {
        return userId != null && users.findById(userId).map(PortalUser::isActive).orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean has(Long userId, String key, String access) {
        if (userId == null) return false;
        PortalUser u = users.findById(userId).orElse(null);
        if (u == null || !u.isActive()) return false;
        if ("ADMIN".equals(u.getRole())) return true;
        if ("DASHBOARD".equals(key)) return true;
        List<PortalUserPermission> rows = permissions.findByUserId(userId);
        if ("STUDENT".equals(key) && matches(rows, "EXAM_DRIVE", access)) return true;
        return matches(rows, key, access);
    }

    private static boolean matches(List<PortalUserPermission> rows, String key, String access) {
        return rows.stream().anyMatch(p -> p.getPermissionKey().equals(key)
                && ("READ".equals(access) ? (p.isReadAccess() || p.isModifyAccess()) : p.isModifyAccess()));
    }

    @Transactional(readOnly = true)
    public PortalUserResponse toResponse(PortalUser u) {
        Map<String, PortalUserResponse.PermissionValue> map = new LinkedHashMap<>();
        for (PortalUserPermission p : permissions.findByUserId(u.getId()))
            if (PERMISSION_KEYS.contains(p.getPermissionKey()))
                map.put(p.getPermissionKey(), new PortalUserResponse.PermissionValue(p.isReadAccess() || p.isModifyAccess(), p.isModifyAccess()));
        for (String key : PERMISSION_KEYS) map.putIfAbsent(key, new PortalUserResponse.PermissionValue(false, false));
        map.put("DASHBOARD", new PortalUserResponse.PermissionValue(true, false));
        return new PortalUserResponse(u.getId(), u.getName(), u.getEmail(), u.getRole(), u.isActive(), map);
    }

    private void savePermissions(PortalUser u, Map<String, PortalUserRequest.PermissionValue> map) {
        Map<String, PortalUserRequest.PermissionValue> source = map == null ? Map.of() : map;
        List<PortalUserPermission> existing = u.getId() == null ? List.of() : permissions.findByUserId(u.getId());
        for (String key : PERMISSION_KEYS) upsertPermission(u, key, true, false, source.get(key), existing);
    }

    private void upsertPermission(PortalUser u, String key, boolean defaultRead, boolean defaultModify,
                                  PortalUserRequest.PermissionValue value, List<PortalUserPermission> existing) {
        boolean modify = value == null ? defaultModify : Boolean.TRUE.equals(value.modify());
        boolean read = value == null ? defaultRead : (Boolean.TRUE.equals(value.read()) || modify);
        PortalUserPermission row = existing.stream().filter(p -> key.equals(p.getPermissionKey())).findFirst().orElse(null);
        if (row == null) {
            row = PortalUserPermission.builder().user(u).permissionKey(key).readAccess(read).modifyAccess(modify).build();
        } else {
            row.setReadAccess(read);
            row.setModifyAccess(modify);
        }
        permissions.save(row);
    }
}
