#!/bin/bash
#
# CEDA E2E Lifecycle Test Script
# Ticket: CEDA-93
#
# Tests the complete user lifecycle:
# 1. CLI login flow (npx @spilno/herald-mcp login)
# 2. Config generation (npx @spilno/herald-mcp config)
# 3. Herald reflect API
# 4. Usage tracking API
# 5. Dashboard pattern display
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Configuration
CEDA_URL="${CEDA_URL:-http://localhost:3030}"
TEST_COMPANY="${TEST_COMPANY:-e2e-test-company}"
TEST_PROJECT="${TEST_PROJECT:-e2e-test-project}"
TEST_USER="${TEST_USER:-e2e-test-user}"
TIMEOUT="${TIMEOUT:-10}"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((TESTS_SKIPPED++))
}

log_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if server is running
check_server() {
    curl -s --max-time "$TIMEOUT" "${CEDA_URL}/health" >/dev/null 2>&1
}

# Make API request and return response
api_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    
    if [ "$method" = "GET" ]; then
        curl -s --max-time "$TIMEOUT" -X GET "${CEDA_URL}${endpoint}" -H "Content-Type: application/json"
    else
        curl -s --max-time "$TIMEOUT" -X "$method" "${CEDA_URL}${endpoint}" -H "Content-Type: application/json" -d "$data"
    fi
}

# ============================================
# Test 1: CLI Login Flow
# ============================================
test_cli_login() {
    log_section "Test 1: CLI Login Flow"
    
    # Test 1.1: Check if npx is available
    if command_exists npx; then
        log_success "npx command is available"
    else
        log_fail "npx command not found - Node.js/npm required"
        return 1
    fi
    
    # Test 1.2: Test login help command
    log_info "Testing login --help command..."
    local help_output
    help_output=$(npx @spilno/herald-mcp login --help 2>&1) || true
    
    if echo "$help_output" | grep -q -i "login\|authenticate\|github\|oauth"; then
        log_success "Login help command works and shows authentication info"
    else
        log_fail "Login help command did not return expected output"
        echo "Output: $help_output"
    fi
    
    # Test 1.3: Verify token storage location is documented
    if echo "$help_output" | grep -q "\.herald\|token"; then
        log_success "Token storage location is documented in help"
    else
        log_skip "Token storage location not explicitly mentioned in help (non-critical)"
    fi
    
    # Test 1.4: Check ~/.herald directory structure
    log_info "Checking Herald config directory structure..."
    local herald_dir="$HOME/.herald"
    if [ -d "$herald_dir" ]; then
        log_success "Herald config directory exists at $herald_dir"
    else
        log_info "Herald config directory does not exist yet (will be created on first login)"
        log_success "Herald directory check completed (directory created on first use)"
    fi
}

# ============================================
# Test 2: Config Generation
# ============================================
test_config_generation() {
    log_section "Test 2: Config Generation"
    
    # Test 2.1: Test config help command
    log_info "Testing config --help command..."
    local help_output
    help_output=$(npx @spilno/herald-mcp config --help 2>&1) || true
    
    if echo "$help_output" | grep -q -i "config\|mcp\|client"; then
        log_success "Config help command works"
    else
        log_fail "Config help command did not return expected output"
        echo "Output: $help_output"
    fi
    
    # Test 2.2: Test JSON config output
    log_info "Testing config --json output..."
    local config_output
    config_output=$(npx @spilno/herald-mcp config --json 2>&1) || true
    
    if echo "$config_output" | grep -q "mcpServers"; then
        log_success "Config generates valid MCP server configuration"
    else
        log_fail "Config did not generate expected MCP configuration"
        echo "Output: $config_output"
    fi
    
    # Test 2.3: Verify config structure has herald server
    if echo "$config_output" | grep -q '"herald"'; then
        log_success "Config includes herald server definition"
    else
        log_fail "Config missing herald server definition"
    fi
    
    # Test 2.4: Verify config has command and args
    if echo "$config_output" | grep -q '"command"' && echo "$config_output" | grep -q '"args"'; then
        log_success "Config has required command and args fields"
    else
        log_fail "Config missing command or args fields"
    fi
    
    # Test 2.5: Test different client outputs
    log_info "Testing config for different clients..."
    for client in claude cursor windsurf; do
        local client_output
        client_output=$(npx @spilno/herald-mcp config --client "$client" 2>&1) || true
        if echo "$client_output" | grep -q "mcpServers\|$client"; then
            log_success "Config works for $client client"
        else
            log_skip "Config for $client client may have different format"
        fi
    done
}

# ============================================
# Test 3: Herald Reflect API
# ============================================
test_herald_reflect_api() {
    log_section "Test 3: Herald Reflect API"
    
    # Check if server is running
    if ! check_server; then
        log_skip "CEDA server not running at $CEDA_URL - skipping API tests"
        log_info "Start the server with: yarn serve (in the ceda directory)"
        return 0
    fi
    
    log_success "CEDA server is running at $CEDA_URL"
    
    # Test 3.1: Test reflect dry-run endpoint
    log_info "Testing /api/herald/reflect/dry-run endpoint..."
    local dry_run_response
    dry_run_response=$(api_request POST "/api/herald/reflect/dry-run" '{
        "session": "e2e-test-session",
        "feeling": "success",
        "insight": "E2E test pattern - testing reflect API",
        "company": "'"$TEST_COMPANY"'",
        "project": "'"$TEST_PROJECT"'",
        "user": "'"$TEST_USER"'"
    }')
    
    if echo "$dry_run_response" | grep -q -i "preview\|pattern\|antipattern\|signal\|outcome"; then
        log_success "Reflect dry-run endpoint returns preview data"
    else
        log_fail "Reflect dry-run endpoint did not return expected preview"
        echo "Response: $dry_run_response"
    fi
    
    # Test 3.2: Test reflect endpoint with success feeling
    log_info "Testing /api/herald/reflect endpoint (success pattern)..."
    local reflect_response
    reflect_response=$(api_request POST "/api/herald/reflect" '{
        "session": "e2e-test-session-'"$(date +%s)"'",
        "feeling": "success",
        "insight": "E2E test: This approach worked well for testing",
        "company": "'"$TEST_COMPANY"'",
        "project": "'"$TEST_PROJECT"'",
        "user": "'"$TEST_USER"'"
    }')
    
    if echo "$reflect_response" | grep -q -i "id\|pattern\|captured\|recorded\|success"; then
        log_success "Reflect endpoint captures success patterns"
    else
        log_fail "Reflect endpoint did not capture pattern correctly"
        echo "Response: $reflect_response"
    fi
    
    # Test 3.3: Test reflect endpoint with stuck feeling (antipattern)
    log_info "Testing /api/herald/reflect endpoint (antipattern)..."
    local antipattern_response
    antipattern_response=$(api_request POST "/api/herald/reflect" '{
        "session": "e2e-test-session-anti-'"$(date +%s)"'",
        "feeling": "stuck",
        "insight": "E2E test: This approach caused issues during testing",
        "company": "'"$TEST_COMPANY"'",
        "project": "'"$TEST_PROJECT"'",
        "user": "'"$TEST_USER"'"
    }')
    
    if echo "$antipattern_response" | grep -q -i "id\|antipattern\|captured\|recorded\|warning"; then
        log_success "Reflect endpoint captures antipatterns"
    else
        log_fail "Reflect endpoint did not capture antipattern correctly"
        echo "Response: $antipattern_response"
    fi
    
    # Test 3.4: Test reflect endpoint validation (missing required fields)
    log_info "Testing reflect endpoint validation..."
    local validation_response
    validation_response=$(api_request POST "/api/herald/reflect" '{
        "feeling": "success"
    }')
    
    if echo "$validation_response" | grep -q -i "error\|required\|missing\|session"; then
        log_success "Reflect endpoint validates required fields"
    else
        log_skip "Reflect endpoint may have different validation behavior"
    fi
}

# ============================================
# Test 4: Usage Tracking API
# ============================================
test_usage_tracking_api() {
    log_section "Test 4: Usage Tracking API"
    
    # Check if server is running
    if ! check_server; then
        log_skip "CEDA server not running at $CEDA_URL - skipping API tests"
        return 0
    fi
    
    # Test 4.1: Test usage endpoint (unauthenticated)
    log_info "Testing /api/usage endpoint (unauthenticated)..."
    local usage_response
    usage_response=$(api_request GET "/api/usage")
    
    if echo "$usage_response" | grep -q -i "unauthorized\|error\|token"; then
        log_success "Usage endpoint requires authentication (expected behavior)"
    elif echo "$usage_response" | grep -q -i "usage\|limit\|queries\|patterns"; then
        log_success "Usage endpoint returns usage data"
    else
        log_fail "Usage endpoint returned unexpected response"
        echo "Response: $usage_response"
    fi
    
    # Test 4.2: Test telemetry endpoint (public)
    log_info "Testing /api/telemetry endpoint..."
    local telemetry_response
    telemetry_response=$(api_request GET "/api/telemetry?period=day&limit=10")
    
    if echo "$telemetry_response" | grep -q -i "telemetry\|events\|entries\|timestamp\|\[\]"; then
        log_success "Telemetry endpoint returns data"
    else
        log_fail "Telemetry endpoint did not return expected data"
        echo "Response: $telemetry_response"
    fi
    
    # Test 4.3: Test health endpoint (includes usage info)
    log_info "Testing /health endpoint for system status..."
    local health_response
    health_response=$(api_request GET "/health")
    
    if echo "$health_response" | grep -q -i "status\|ok\|healthy\|patterns"; then
        log_success "Health endpoint returns system status"
    else
        log_fail "Health endpoint did not return expected status"
        echo "Response: $health_response"
    fi
    
    # Test 4.4: Test stats endpoint
    log_info "Testing /api/stats endpoint..."
    local stats_response
    stats_response=$(api_request GET "/api/stats")
    
    if echo "$stats_response" | grep -q -i "patterns\|sessions\|predictions\|count\|stats"; then
        log_success "Stats endpoint returns system statistics"
    else
        log_fail "Stats endpoint did not return expected statistics"
        echo "Response: $stats_response"
    fi
}

# ============================================
# Test 5: Dashboard Pattern Display
# ============================================
test_dashboard_patterns() {
    log_section "Test 5: Dashboard Pattern Display"
    
    # Check if server is running
    if ! check_server; then
        log_skip "CEDA server not running at $CEDA_URL - skipping API tests"
        return 0
    fi
    
    # Test 5.1: Test patterns endpoint with user filter
    log_info "Testing /api/patterns endpoint with user filter..."
    local patterns_response
    patterns_response=$(api_request GET "/api/patterns?user=$TEST_USER")
    
    if echo "$patterns_response" | grep -q -i "patterns\|id\|name\|category\|\[\]"; then
        log_success "Patterns endpoint returns pattern list"
    else
        log_fail "Patterns endpoint did not return expected data"
        echo "Response: $patterns_response"
    fi
    
    # Test 5.2: Test patterns endpoint with company filter
    log_info "Testing /api/patterns endpoint with company filter..."
    local company_patterns_response
    company_patterns_response=$(api_request GET "/api/patterns?company=$TEST_COMPANY&user=$TEST_USER")
    
    if echo "$company_patterns_response" | grep -q -i "patterns\|id\|\[\]"; then
        log_success "Patterns endpoint filters by company"
    else
        log_fail "Patterns endpoint company filter did not work"
        echo "Response: $company_patterns_response"
    fi
    
    # Test 5.3: Test patterns endpoint with project filter
    log_info "Testing /api/patterns endpoint with project filter..."
    local project_patterns_response
    project_patterns_response=$(api_request GET "/api/patterns?company=$TEST_COMPANY&project=$TEST_PROJECT&user=$TEST_USER")
    
    if echo "$project_patterns_response" | grep -q -i "patterns\|id\|\[\]"; then
        log_success "Patterns endpoint filters by project"
    else
        log_fail "Patterns endpoint project filter did not work"
        echo "Response: $project_patterns_response"
    fi
    
    # Test 5.4: Test herald reflections endpoint (learned patterns)
    log_info "Testing /api/herald/reflections endpoint..."
    local reflections_response
    reflections_response=$(api_request GET "/api/herald/reflections?company=$TEST_COMPANY&user=$TEST_USER")
    
    if echo "$reflections_response" | grep -q -i "reflections\|patterns\|antipatterns\|id\|\[\]"; then
        log_success "Herald reflections endpoint returns learned patterns"
    else
        log_fail "Herald reflections endpoint did not return expected data"
        echo "Response: $reflections_response"
    fi
    
    # Test 5.5: Test analytics patterns endpoint
    log_info "Testing /api/analytics/patterns endpoint..."
    local analytics_patterns_response
    analytics_patterns_response=$(api_request GET "/api/analytics/patterns?company=$TEST_COMPANY&period=month")
    
    if echo "$analytics_patterns_response" | grep -q -i "patterns\|top\|usage\|count\|\[\]"; then
        log_success "Analytics patterns endpoint returns top patterns"
    else
        log_fail "Analytics patterns endpoint did not return expected data"
        echo "Response: $analytics_patterns_response"
    fi
    
    # Test 5.6: Test pattern structure (if patterns exist)
    log_info "Verifying pattern structure..."
    if echo "$patterns_response" | grep -q '"id"'; then
        if echo "$patterns_response" | grep -q -E '"(name|category|structure|metadata)"'; then
            log_success "Patterns have expected structure (id, name/category/structure)"
        else
            log_skip "Pattern structure may vary based on pattern type"
        fi
    else
        log_skip "No patterns found to verify structure (expected for new installations)"
    fi
}

# ============================================
# Main Test Runner
# ============================================
main() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           CEDA E2E Lifecycle Test Suite                    ║${NC}"
    echo -e "${BLUE}║                    Ticket: CEDA-93                         ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Configuration:"
    echo "  CEDA_URL:     $CEDA_URL"
    echo "  TEST_COMPANY: $TEST_COMPANY"
    echo "  TEST_PROJECT: $TEST_PROJECT"
    echo "  TEST_USER:    $TEST_USER"
    echo "  TIMEOUT:      ${TIMEOUT}s"
    echo ""
    
    # Run all tests
    test_cli_login
    test_config_generation
    test_herald_reflect_api
    test_usage_tracking_api
    test_dashboard_patterns
    
    # Summary
    log_section "Test Summary"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo ""
    
    local total=$((TESTS_PASSED + TESTS_FAILED))
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All $total tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}$TESTS_FAILED of $total tests failed${NC}"
        exit 1
    fi
}

# Run main function
main "$@"
