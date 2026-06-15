#!/bin/bash

# RESTAP Server Test Script
# Tests all endpoints of a running RESTAP server

# Configuration
SERVER_URL="${SERVER_URL:-http://localhost:3000}"
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Helper functions
print_header() {
    echo -e "\n${BLUE}================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}================================${NC}\n"
}

print_test() {
    echo -e "${YELLOW}Testing: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ PASS: $1${NC}"
    ((TESTS_PASSED++))
}

print_failure() {
    echo -e "${RED}✗ FAIL: $1${NC}"
    if [ "$2" ]; then
        echo -e "${RED}  Details: $2${NC}"
    fi
    ((TESTS_FAILED++))
}

run_test() {
    local test_name="$1"
    local command="$2"

    ((TESTS_RUN++))

    print_test "$test_name"

    if [ "$VERBOSE" = "true" ]; then
        echo "Command: $command"
    fi

    # Run the command and capture output and status
    local output
    local status
    output=$(eval "$command" 2>&1)
    status=$?

    if [ $status -eq 0 ]; then
        # For curl commands, check if we got valid JSON
        if [[ "$command" == curl* ]]; then
            if echo "$output" | jq . >/dev/null 2>&1; then
                print_success "$test_name"
                if [ "$VERBOSE" = "true" ]; then
                    echo "Response: $output"
                fi
            else
                print_failure "$test_name" "Invalid JSON response: $output"
            fi
        else
            print_success "$test_name"
            if [ "$VERBOSE" = "true" ]; then
                echo "Output: $output"
            fi
        fi
    else
        print_failure "$test_name" "Command failed with status $status: $output"
    fi
}

# Check if server is running
check_server() {
    print_header "Checking Server Status"

    run_test "Server Health Check" \
        "curl -s '$SERVER_URL/health'"

    if [ $? -ne 0 ]; then
        echo -e "\n${RED}Server is not running or not accessible at $SERVER_URL${NC}"
        echo "Make sure to start the server with: npm run dev"
        exit 1
    fi
}

# Test discovery endpoint
test_discovery() {
    print_header "Testing Discovery Endpoint"

    run_test "RESTAP Catalog Discovery" \
        "curl -s '$SERVER_URL/.well-known/restap.json'"

    # Validate catalog structure
    run_test "Catalog Structure Validation" \
        "curl -s '$SERVER_URL/.well-known/restap.json' | jq -e '.restap_version and .provider and .capabilities'"

    # Check capabilities
    run_test "Capabilities Exist" \
        "curl -s '$SERVER_URL/.well-known/restap.json' | jq -e '.capabilities | length > 0'"
}

# Test talk endpoint
test_talk() {
    print_header "Testing Talk Endpoint"

    run_test "Talk - Hello Message" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{\"message\":\"Hello!\"}' '$SERVER_URL/talk'"

    run_test "Talk - Capabilities Query" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{\"message\":\"What can you do?\"}' '$SERVER_URL/talk'"

    run_test "Talk - Echo Help" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{\"message\":\"Tell me about echo\"}' '$SERVER_URL/talk'"

    run_test "Talk - Missing Message Error" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{}' '$SERVER_URL/talk' | jq -e '.error'"
}

# Test capabilities
test_capabilities() {
    print_header "Testing Capabilities"

    # Test echo capability
    run_test "Echo Capability - Valid Request" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{\"text\":\"Hello World\"}' '$SERVER_URL/text/echo'"

    run_test "Echo Capability - Missing Text Error" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{}' '$SERVER_URL/text/echo' | jq -e '.error'"

    # Test reverse capability
    run_test "Reverse Capability - Valid Request" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{\"text\":\"Hello World\"}' '$SERVER_URL/text/reverse'"

    run_test "Reverse Capability - Missing Text Error" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{}' '$SERVER_URL/text/reverse' | jq -e '.error'"

    # Test reverse functionality
    run_test "Reverse Capability - Correct Output" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{\"text\":\"abc\"}' '$SERVER_URL/text/reverse' | jq -e '.reversed_text == \"cba\"'"
}

# Test news endpoint
test_news() {
    print_header "Testing News Endpoint"

    run_test "News Feed (GET)" \
        "curl -s '$SERVER_URL/news'"

    run_test "News Structure" \
        "curl -s '$SERVER_URL/news' | jq -e '.items and (.items | type == \"array\")'"

    run_test "News with since parameter" \
        "curl -s '$SERVER_URL/news?since=0' | jq -e '.items'"

    run_test "News Receive (POST) - Valid Request" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{\"type\":\"reply\",\"from\":\"agent-b\",\"in_reply_to\":\"query_123\",\"message\":\"Test reply\"}' '$SERVER_URL/news'"

    run_test "News Receive (POST) - Missing Type Error" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{\"from\":\"agent-b\"}' '$SERVER_URL/news' | jq -e '.error'"
}

# Run comprehensive capability test
test_full_flow() {
    print_header "Testing Full RESTAP Flow"

    echo "1. Discover capabilities..."
    local catalog=$(curl -s "$SERVER_URL/.well-known/restap.json")
    local echo_endpoint=$(echo "$catalog" | jq -r '.capabilities[] | select(.id == "text.echo") | .endpoint')
    local reverse_endpoint=$(echo "$catalog" | jq -r '.capabilities[] | select(.id == "text.reverse") | .endpoint')

    if [ "$echo_endpoint" = "/text/echo" ] && [ "$reverse_endpoint" = "/text/reverse" ]; then
        print_success "Capability Discovery"
    else
        print_failure "Capability Discovery" "Endpoints not found correctly"
    fi

    echo -e "\n2. Execute echo capability..."
    local echo_result=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"text":"RESTAP Test"}' "$SERVER_URL/text/echo")
    local echoed_text=$(echo "$echo_result" | jq -r '.echoed_text')

    if [ "$echoed_text" = "RESTAP Test" ]; then
        print_success "Echo Capability Execution"
    else
        print_failure "Echo Capability Execution" "Expected 'RESTAP Test', got '$echoed_text'"
    fi

    echo -e "\n3. Check news for job updates..."
    local news=$(curl -s "$SERVER_URL/news")
    local job_count=$(echo "$news" | jq '.items | length')

    if [ "$job_count" -gt 0 ]; then
        print_success "News Feed Updates"
    else
        print_failure "News Feed Updates" "No jobs found in news feed"
    fi
}

# Performance test
test_performance() {
    print_header "Performance Testing"

    echo "Running 10 concurrent requests..."

    # Time 10 concurrent requests
    local start_time=$(date +%s%3N)
    for i in {1..10}; do
        curl -s -X POST -H 'Content-Type: application/json' -d '{"text":"test"}' "$SERVER_URL/text/echo" >/dev/null &
    done
    wait
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))

    if [ $duration -lt 2000 ]; then  # Less than 2 seconds for 10 requests
        print_success "Performance Test (${duration}ms for 10 requests)"
    else
        print_failure "Performance Test" "Too slow: ${duration}ms"
    fi
}

# Show usage
show_usage() {
    echo "RESTAP Server Test Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -u, --url URL       Server URL (default: http://localhost:3000)"
    echo "  -v, --verbose       Show detailed output"
    echo "  -q, --quick         Run only essential tests"
    echo "  -p, --performance   Include performance testing"
    echo "  -h, --help          Show this help"
    echo ""
    echo "Examples:"
    echo "  $0                          # Run all tests"
    echo "  $0 --verbose               # Run with detailed output"
    echo "  $0 --url http://prod.example.com:8080  # Test production server"
    echo "  $0 --quick                 # Run only essential tests"
}

# Parse command line arguments
QUICK_MODE=false
PERF_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            SERVER_URL="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -q|--quick)
            QUICK_MODE=true
            shift
            ;;
        -p|--performance)
            PERF_MODE=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required for this test script${NC}"
    echo "Install jq with: brew install jq (macOS) or apt install jq (Linux)"
    exit 1
fi

# Main test execution
echo -e "${BLUE}🧪 RESTAP Server Test Suite${NC}"
echo -e "${BLUE}Testing server at: $SERVER_URL${NC}"
echo -e "${BLUE}Started at: $(date)${NC}\n"

check_server

if [ "$QUICK_MODE" = "false" ]; then
    test_discovery
    test_talk
    test_capabilities
    test_news
    test_full_flow

    if [ "$PERF_MODE" = "true" ]; then
        test_performance
    fi
else
    # Quick mode - just essential tests
    test_discovery
    run_test "Echo Capability Quick Test" \
        "curl -s -X POST -H 'Content-Type: application/json' -d '{\"text\":\"quick test\"}' '$SERVER_URL/text/echo'"
fi

# Summary
print_header "Test Summary"

echo -e "${BLUE}Tests Run: $TESTS_RUN${NC}"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! RESTAP server is working correctly.${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Check the server implementation.${NC}"
    exit 1
fi