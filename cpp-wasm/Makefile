# Makefile for mini_imgproc WASM
# Compiles C++ image processing to WebAssembly

# Emscripten settings
EMCC = emcc
OPTIMIZATION = -O3
EXPORTED_FUNCTIONS = -s EXPORTED_FUNCTIONS="['_x9', '_y2', '_z3', '_malloc', '_free']"
EXPORTED_RUNTIME = -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'getValue', 'setValue', 'UTF8ToString', 'stringToUTF8', 'HEAP8', 'HEAPU8']"

# Build settings - ES2019 compatible (no optional chaining)
WASM_FLAGS = \
	$(OPTIMIZATION) \
	-s WASM=1 \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s INITIAL_MEMORY=16MB \
	-s MAXIMUM_MEMORY=256MB \
	-s MODULARIZE=1 \
	-s EXPORT_ES6=1 \
	-s ENVIRONMENT=web \
	-s NO_FILESYSTEM=1 \
	-s DISABLE_EXCEPTION_CATCHING=1 \
	-s NO_EXIT_RUNTIME=1 \
	-s WASM_BIGINT=0 \
	-s MIN_CHROME_VERSION=79 \
	-s MIN_FIREFOX_VERSION=73 \
	-s MIN_SAFARI_VERSION=130100 \
	$(EXPORTED_FUNCTIONS) \
	$(EXPORTED_RUNTIME) \
	-flto

# Include paths
INCLUDES = -I.

# Source files
SOURCES = mini_imgproc.cpp bindings.cpp

# Output
OUTPUT = ../src-js/imgproc-wasm.js

.PHONY: all clean debug

all: $(OUTPUT)

$(OUTPUT): $(SOURCES) mini_imgproc.h
	@echo "Building WASM module..."
	$(EMCC) $(SOURCES) $(WASM_FLAGS) $(INCLUDES) -o $(OUTPUT)
	@echo "✓ Built: $(OUTPUT)"
	@ls -lh $(OUTPUT) ../src-js/imgproc-wasm.wasm 2>/dev/null || true

# Debug build with symbols
debug:
	$(EMCC) $(SOURCES) -O0 -g \
		-s WASM=1 \
		-s ALLOW_MEMORY_GROWTH=1 \
		-s INITIAL_MEMORY=16MB \
		-s MAXIMUM_MEMORY=256MB \
		-s MODULARIZE=1 \
		-s EXPORT_ES6=1 \
		$(EXPORTED_FUNCTIONS) \
		$(EXPORTED_RUNTIME) \
		$(INCLUDES) \
		-o $(OUTPUT)
	@echo "✓ Debug build complete"

clean:
	rm -f $(OUTPUT) ../src-js/imgproc-wasm.wasm native-test edge-test
	@echo "Cleaned build files"

# Check for Emscripten
verify:
	@which $(EMCC) > /dev/null 2>&1 || (echo "Error: Emscripten not found. Install: https://emscripten.org/docs/getting_started/downloads.html" && exit 1)
	@echo "Emscripten found: $(shell $(EMCC) --version | head -1)"

# Native test runner (for local testing)
native-test: mini_imgproc.cpp native-test.cpp mini_imgproc.h
	g++ -O3 $(INCLUDES) mini_imgproc.cpp native-test.cpp -o native-test
	@echo "✓ Built native test runner"

# Raw edge detection test
edge-test: mini_imgproc.cpp edge-test.cpp mini_imgproc.h
	g++ -O3 $(INCLUDES) mini_imgproc.cpp edge-test.cpp -o edge-test
	@echo "✓ Built edge detection test"
