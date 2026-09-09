#!/usr/bin/env python3
"""Benchmark and stress-test Ollama models to determine optimal KWIPU_QUERY_MAX_LENGTH."""

import sys
import os
import time
import argparse
import asyncio
import statistics
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Add project root to path to import kwipu_config
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))

try:
    import kwipu_config
    from llama_index.llms.ollama import Ollama
    from llama_index.embeddings.ollama import OllamaEmbedding
except ImportError as e:
    print(f"Error: Missing dependencies. Make sure you are running in the kwipu environment. {e}")
    sys.exit(1)

async def benchmark_call(func, *args, **kwargs):
    """Run a synchronous call in a thread pool and measure time."""
    loop = asyncio.get_running_loop()
    start_time = time.perf_counter()
    try:
        await loop.run_in_executor(None, lambda: func(*args, **kwargs))
        return (time.perf_counter() - start_time) * 1000
    except Exception as e:
        return str(e)

async def run_trials(func, text, trials=3, concurrency=1):
    """Run multiple trials, possibly concurrently."""
    tasks = []
    for _ in range(trials):
        tasks.append(benchmark_call(func, text))

    # Process in batches of 'concurrency'
    results = []
    for i in range(0, len(tasks), concurrency):
        batch = tasks[i:i+concurrency]
        batch_results = await asyncio.gather(*batch)
        results.extend(batch_results)

    return results

def report_stats(name, results):
    successes = [r for r in results if isinstance(r, (int, float))]
    failures = [r for r in results if not isinstance(r, (int, float))]

    if not successes:
        return f"{name}: ALL FAILED ({failures[0] if failures else 'Unknown'})", False

    avg = statistics.mean(successes)
    p95 = statistics.quantiles(successes, n=20)[18] if len(successes) >= 20 else max(successes)
    min_val = min(successes)
    max_val = max(successes)

    stat_str = f"{name}: Avg={avg:.2f}ms, P95={p95:.2f}ms, Min={min_val:.2f}ms, Max={max_val:.2f}ms"
    if failures:
        stat_str += f" (Failures: {len(failures)})"

    return stat_str, True

def update_env(new_length):
    env_path = project_root / ".env"
    if not env_path.exists():
        print("Error: .env file not found in project root.")
        return False

    content = env_path.read_text()
    lines = content.splitlines()
    found = False
    new_lines = []
    for line in lines:
        if line.startswith("KWIPU_QUERY_MAX_LENGTH="):
            new_lines.append(f"KWIPU_QUERY_MAX_LENGTH={new_length}")
            found = True
        else:
            new_lines.append(line)

    if not found:
        new_lines.append(f"KWIPU_QUERY_MAX_LENGTH={new_length}")

    env_path.write_text("\n".join(new_lines) + "\n")
    return True

async def main():
    parser = argparse.ArgumentParser(description="Benchmark and Stress Test Kwipu query length.")
    parser.add_argument("--max-test", type=int, default=12000, help="Maximum length to test.")
    parser.add_argument("--step", type=int, default=2000, help="Step size for testing.")
    parser.add_argument("--trials", type=int, default=3, help="Number of trials per length.")
    parser.add_argument("--concurrency", type=int, default=1, help="Number of concurrent requests (Stress Test).")
    parser.add_argument("--threshold", type=float, default=5000.0, help="Latency threshold in ms for P95 embedding.")
    parser.add_argument("--apply", action="store_true", help="Apply the recommended value to .env.")
    args = parser.parse_args()

    print(f"--- Kwipu Performance & Stress Test ---")
    print(f"Ollama URL: {kwipu_config.OLLAMA_BASE_URL}")
    print(f"LLM Model: {kwipu_config.MODEL_NAME}")
    print(f"Embedding Model: {kwipu_config.EMBED_MODEL}")
    print(f"Config: {args.trials} trials, Concurrency: {args.concurrency}, Threshold: {args.threshold}ms")
    print("-" * 40)

    llm = Ollama(
        model=kwipu_config.MODEL_NAME,
        base_url=kwipu_config.OLLAMA_BASE_URL,
        request_timeout=120.0
    )
    embed_model = OllamaEmbedding(
        model_name=kwipu_config.EMBED_MODEL,
        base_url=kwipu_config.OLLAMA_BASE_URL
    )

    # Warmup
    print("Warming up models...")
    await benchmark_call(embed_model.get_text_embedding, "warmup")
    await benchmark_call(llm.complete, "Hello")

    lengths = range(args.step, args.max_test + 1, args.step)
    recommended = 4000

    for length in lengths:
        dummy_text = "test " * (length // 5)
        print(f"\nTesting length: {length} chars")

        # Benchmark Embedding
        embed_results = await run_trials(embed_model.get_text_embedding, dummy_text, trials=args.trials, concurrency=args.concurrency)
        embed_report, success = report_stats("  Embedding", embed_results)
        print(embed_report)

        if not success:
            print("  Stopping: Embedding failed.")
            break

        # Extract P95 for recommendation
        success_times = [r for r in embed_results if isinstance(r, (int, float))]
        p95 = statistics.quantiles(success_times, n=20)[18] if len(success_times) >= 20 else max(success_times)

        if p95 < args.threshold:
            recommended = length
        else:
            print(f"  Threshold exceeded ({p95:.2f}ms > {args.threshold}ms).")
            # Don't break immediately, maybe user wants to see higher results,
            # but we stop updating 'recommended'.

        # Optional: Spot-check LLM at this length (just 1 trial as it is heavy)
        llm_results = await run_trials(llm.complete, f"Repeat this word once: test. Context: {dummy_text[:2000]}", trials=1)
        llm_report, _ = report_stats("  LLM (2k ctx)", llm_results)
        print(llm_report)

    print("\n" + "=" * 40)
    print(f"RESULT: Optimal KWIPU_QUERY_MAX_LENGTH = {recommended}")
    print(f"Based on {args.threshold}ms threshold and concurrency level {args.concurrency}.")

    if args.apply:
        if update_env(recommended):
            print(f"SUCCESS: Updated .env with KWIPU_QUERY_MAX_LENGTH={recommended}")
        else:
            print("ERROR: Failed to update .env")
    else:
        print("TIP: Run with --apply to save this value to your .env file.")

if __name__ == "__main__":
    asyncio.run(main())
