"""
Experiment analysis: metrics.json → box plots, summary table, statistical tests, HTML report.

Output goes to public/experiments/ for deployment.
"""

import json
import shutil
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.collections import LineCollection
import pandas as pd
from jinja2 import Environment, FileSystemLoader
from scipy import stats
import statsmodels.api as sm
from statsmodels.formula.api import ols
from statsmodels.stats.anova import anova_lm
from statsmodels.stats.multicomp import pairwise_tukeyhsd

ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = ROOT / "experiments" / "results"
IMAGES_DIR = RESULTS_DIR / "images"
OUTPUT_DIR = ROOT / "public" / "experiments"
ASSETS_DIR = OUTPUT_DIR / "assets"
OUTPUT_IMAGES_DIR = OUTPUT_DIR / "images"

CONDITIONS = ["poissonBfs", "poissonRandom", "randomBfs", "randomRandom", "gridCheckerboard"]
CONDITION_LABELS = {
    "poissonBfs": "Poisson + BFS",
    "poissonRandom": "Poisson + Random",
    "randomBfs": "Random + BFS",
    "randomRandom": "Random + Random",
    "gridCheckerboard": "Grid + Checkerboard",
}
# Original 4 conditions for 2×2 ANOVA (gridCheckerboard is outside the factorial design)
ANOVA_CONDITIONS = ["poissonBfs", "poissonRandom", "randomBfs", "randomRandom"]
METRICS = ["eContrast", "eLdG", "sOrder", "cCov", "uVor", "hAngle"]
METRIC_LABELS = {
    "eContrast": r"$E_{\mathrm{contrast}}$",
    "eLdG": r"$E_{\mathrm{LdG}}$",
    "sOrder": r"$S$",
    "cCov": r"$C_{\mathrm{cov}}$",
    "uVor": r"$U_{\mathrm{vor}}$",
    "hAngle": r"$H_{\mathrm{angle}}$",
}
METRIC_LABELS_PLAIN = {
    "eContrast": "E_contrast",
    "eLdG": "E_LdG",
    "sOrder": "S",
    "cCov": "C_cov",
    "uVor": "U_vor",
    "hAngle": "H_angle",
}
# For E_contrast, E_LdG, C_cov, H_angle: higher is better; for S, U_vor: lower is better
METRIC_HIGHER_IS_BETTER = {
    "eContrast": True,
    "eLdG": True,
    "sOrder": False,
    "cCov": True,
    "uVor": False,
    "hAngle": True,
}


def load_data() -> pd.DataFrame:
    with open(RESULTS_DIR / "metrics.json") as f:
        data = json.load(f)
    return pd.DataFrame(data)


def plot_boxplots(df: pd.DataFrame) -> None:
    """One single-panel figure per metric with 4 box plots (conditions)."""
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    for metric in METRICS:
        fig, ax = plt.subplots(figsize=(6, 4))
        fig.suptitle(METRIC_LABELS.get(metric, metric), fontsize=14, y=1.02)

        data = [df[df["condition"] == c][metric].values for c in CONDITIONS]
        labels = [CONDITION_LABELS[c] for c in CONDITIONS]

        bp = ax.boxplot(data, tick_labels=labels, patch_artist=True, widths=0.6)
        colors = ["#4C72B0", "#55A868", "#C44E52", "#8172B2", "#CCB974"]
        for patch, color in zip(bp["boxes"], colors):
            patch.set_facecolor(color)
            patch.set_alpha(0.7)

        ax.tick_params(axis="x", rotation=45)
        ax.set_ylim(0, 1)
        ax.grid(axis="y", alpha=0.3)

        plt.tight_layout()
        fig.savefig(ASSETS_DIR / f"boxplot_{metric}.png", dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"  Saved boxplot_{metric}.png")


def compute_best_cells(df: pd.DataFrame) -> dict:
    """For each metric, find the best condition. Returns {metric_plain: condition_label}."""
    best = {}
    for m in METRICS:
        means = {}
        for cond in CONDITIONS:
            sub = df[df["condition"] == cond]
            means[CONDITION_LABELS[cond]] = sub[m].mean()
        if METRIC_HIGHER_IS_BETTER[m]:
            best_cond = max(means, key=means.get)
        else:
            best_cond = min(means, key=means.get)
        best[METRIC_LABELS_PLAIN[m]] = best_cond
    return best


def summary_table(df: pd.DataFrame) -> pd.DataFrame:
    """Mean +/- SD for each condition x metric (single table, k=1 only)."""
    rows = []
    for cond in CONDITIONS:
        sub = df[df["condition"] == cond]
        row = {"condition": CONDITION_LABELS[cond]}
        for m in METRICS:
            mean = sub[m].mean()
            std = sub[m].std()
            row[METRIC_LABELS_PLAIN[m]] = f"{mean:.3f} \u00b1 {std:.3f}"
        row["nTiles (mean)"] = f"{sub['nTiles'].mean():.1f}"
        row["nEdges (mean)"] = f"{sub['nEdges'].mean():.1f}"
        rows.append(row)
    return pd.DataFrame(rows)


def two_way_anova(df: pd.DataFrame) -> dict:
    """Two-way ANOVA: placement × angle for each metric (original 4 conditions only)."""
    # Filter to the 4 conditions that belong to the 2×2 factorial design
    df = df[df["condition"].isin(ANOVA_CONDITIONS)].copy()
    df["placement"] = df["condition"].map(
        lambda c: "Poisson" if c.startswith("poisson") else "Random"
    )
    df["angle"] = df["condition"].map(
        lambda c: "BFS" if c.endswith("Bfs") else "Random"
    )

    results = {}
    for metric in METRICS:
        model = ols(f"{metric} ~ C(placement) * C(angle)", data=df).fit()
        table = anova_lm(model, typ=2)
        # Compute η² = SS_effect / SS_total
        ss_total = table["sum_sq"].sum()
        table["eta_sq"] = table["sum_sq"] / ss_total
        results[metric] = table
    return results


def compute_effect_sizes(df: pd.DataFrame) -> dict:
    """Pairwise Cohen's d (pooled SD) for all 10 condition pairs per metric."""
    results = {}
    for metric in METRICS:
        pairs = []
        for i in range(len(CONDITIONS)):
            for j in range(i + 1, len(CONDITIONS)):
                c1, c2 = CONDITIONS[i], CONDITIONS[j]
                x1 = df[df["condition"] == c1][metric].values
                x2 = df[df["condition"] == c2][metric].values
                n1, n2 = len(x1), len(x2)
                pooled_sd = np.sqrt(
                    ((n1 - 1) * x1.std(ddof=1) ** 2 + (n2 - 1) * x2.std(ddof=1) ** 2)
                    / (n1 + n2 - 2)
                )
                d = (x1.mean() - x2.mean()) / pooled_sd if pooled_sd > 0 else 0.0
                pairs.append({
                    "pair": f"{CONDITION_LABELS[c1]} vs {CONDITION_LABELS[c2]}",
                    "cohen_d": d,
                })
        results[metric] = pairs
    return results


def pairwise_tests(df: pd.DataFrame) -> dict:
    """Tukey HSD post-hoc for each metric."""
    results = {}
    for metric in METRICS:
        tukey = pairwise_tukeyhsd(
            df[metric],
            df["condition"].map(CONDITION_LABELS),
            alpha=0.05,
        )
        results[metric] = str(tukey)
    return results


def select_representative_images(df: pd.DataFrame) -> None:
    """Copy k=1..4 images for median-eContrast seeds (from representative_seeds.json)."""
    OUTPUT_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    rep_seeds_path = RESULTS_DIR / "representative_seeds.json"
    if rep_seeds_path.exists():
        with open(rep_seeds_path) as f:
            rep_seeds = json.load(f)
    else:
        # Fallback: compute from metrics data (k=1 only)
        rep_seeds = {}
        for cond in CONDITIONS:
            sub = df[df["condition"] == cond]
            median_val = sub["eContrast"].median()
            closest_idx = (sub["eContrast"] - median_val).abs().idxmin()
            rep_seeds[cond] = int(sub.loc[closest_idx, "seed"])

    for cond in CONDITIONS:
        seed = rep_seeds[cond]
        for k in [1, 2, 3, 4]:
            src = IMAGES_DIR / f"{cond}_k{k}_s{seed}.png"
            dst = OUTPUT_IMAGES_DIR / f"{cond}_k{k}.png"
            if src.exists():
                shutil.copy2(src, dst)
            else:
                print(f"  WARNING: {src} not found")

    print(f"  Copied representative images to {OUTPUT_IMAGES_DIR}")


def generate_algorithm_illustration() -> None:
    """Generate a 3-panel SVG/PNG illustration of the proposed algorithm pipeline."""
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(42)

    # --- Poisson-disk-like points (pre-computed for reproducibility) ---
    # Use simple rejection sampling to get well-spaced points
    region = (0, 0, 6, 6)
    min_dist = 1.1
    points = []
    for _ in range(500):
        p = rng.uniform([region[0], region[1]], [region[2], region[3]])
        ok = True
        for q in points:
            if np.hypot(p[0] - q[0], p[1] - q[1]) < min_dist:
                ok = False
                break
        if ok:
            points.append(p)
    points = np.array(points)
    n = len(points)

    # --- Delaunay adjacency ---
    from scipy.spatial import Delaunay
    tri = Delaunay(points)
    edges = set()
    for simplex in tri.simplices:
        for i in range(3):
            for j in range(i + 1, 3):
                a, b = simplex[i], simplex[j]
                # Only keep short edges (Voronoi-like adjacency)
                if np.hypot(points[a, 0] - points[b, 0], points[a, 1] - points[b, 1]) < min_dist * 2.2:
                    edges.add((min(a, b), max(a, b)))
    edges = list(edges)

    # Build adjacency list
    adj = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        adj[b].append(a)

    # --- BFS greedy angle assignment (replicate core algorithm) ---
    PI = np.pi
    thetas = np.full(n, -1.0)
    visited = np.zeros(n, dtype=bool)

    # Start from highest-degree node
    degrees = [len(adj[i]) for i in range(n)]
    start = int(np.argmax(degrees))

    queue = [start]
    q_head = 0
    visited[start] = True
    thetas[start] = 0.0

    candidates = np.linspace(0, PI, 360, endpoint=False)
    bfs_order = [start]

    while q_head < len(queue):
        node = queue[q_head]
        q_head += 1
        for nb in adj[node]:
            if visited[nb]:
                continue
            visited[nb] = True
            queue.append(nb)
            bfs_order.append(nb)

            placed = [j for j in adj[nb] if thetas[j] >= 0]
            if placed:
                best_theta = 0.0
                best_min_d = -1.0
                for c in candidates:
                    min_d = min(min(abs(c - thetas[j]) % PI, PI - abs(c - thetas[j]) % PI) for j in placed)
                    if min_d > best_min_d:
                        best_min_d = min_d
                        best_theta = c
                thetas[nb] = best_theta
            else:
                thetas[nb] = 0.0

    for i in range(n):
        if thetas[i] < 0:
            thetas[i] = rng.uniform(0, PI)

    # --- Angle colormap ---
    cmap = plt.cm.hsv

    def angle_color(theta):
        return cmap(theta / PI)

    # --- Draw 3 panels ---
    fig, axes = plt.subplots(1, 3, figsize=(15, 5.2))
    titles = [
        "Step 1: Poisson-disk Sampling",
        "Step 2: Voronoi Adjacency Graph",
        "Step 3: BFS Greedy Angle Assignment",
    ]

    for ax, title in zip(axes, titles):
        ax.set_xlim(-0.3, 6.3)
        ax.set_ylim(-0.3, 6.3)
        ax.set_aspect("equal")
        ax.set_title(title, fontsize=11, fontweight="bold", pad=10)
        ax.set_xticks([])
        ax.set_yticks([])
        # Region border
        ax.add_patch(mpatches.Rectangle((0, 0), 6, 6, fill=False, edgecolor="#aaa", linewidth=1, linestyle="--"))

    # Panel 1: Points only
    ax1 = axes[0]
    ax1.scatter(points[:, 0], points[:, 1], s=25, c="#333", zorder=5)

    # Panel 2: Points + edges
    ax2 = axes[1]
    edge_lines = [(points[a], points[b]) for a, b in edges]
    lc = LineCollection(edge_lines, colors="#bbb", linewidths=0.8, zorder=2)
    ax2.add_collection(lc)
    ax2.scatter(points[:, 0], points[:, 1], s=25, c="#333", zorder=5)
    # Highlight start node
    ax2.scatter([points[start, 0]], [points[start, 1]], s=80, c="red", marker="*", zorder=10, label="Start (max degree)")
    ax2.legend(loc="upper right", fontsize=8, framealpha=0.9)

    # Panel 3: Points + edges + angle-colored hatching
    ax3 = axes[2]
    edge_lines3 = [(points[a], points[b]) for a, b in edges]
    lc3 = LineCollection(edge_lines3, colors="#ddd", linewidths=0.5, zorder=2)
    ax3.add_collection(lc3)

    # Draw small hatch lines at each tile center
    hatch_len = 0.35
    for i in range(n):
        theta = thetas[i]
        color = angle_color(theta)
        dx = hatch_len * np.cos(theta)
        dy = hatch_len * np.sin(theta)
        cx, cy = points[i]
        # Draw 3 parallel lines
        perp_x = -np.sin(theta) * 0.12
        perp_y = np.cos(theta) * 0.12
        for offset in [-1, 0, 1]:
            x0 = cx - dx + offset * perp_x
            y0 = cy - dy + offset * perp_y
            x1 = cx + dx + offset * perp_x
            y1 = cy + dy + offset * perp_y
            ax3.plot([x0, x1], [y0, y1], color=color, linewidth=1.5, zorder=4)

    ax3.scatter(points[:, 0], points[:, 1], s=8, c="#333", zorder=6)

    # Show first 3 BFS steps with numbered annotations
    for step_idx in range(min(3, len(bfs_order))):
        node_idx = bfs_order[step_idx]
        cx, cy = points[node_idx]
        ax3.annotate(
            f"{step_idx + 1}",
            (cx, cy),
            textcoords="offset points",
            xytext=(8, 8),
            fontsize=10,
            fontweight="bold",
            color="red",
            bbox=dict(boxstyle="round,pad=0.2", fc="white", ec="red", alpha=0.9),
            zorder=20,
        )

    plt.tight_layout()
    fig.savefig(ASSETS_DIR / "algorithm_pipeline.png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("  Saved algorithm_pipeline.png")


def render_report(
    df: pd.DataFrame,
    summary: pd.DataFrame,
    best_cells: dict,
    anova_results: dict,
    effect_sizes: dict,
    tukey_results: dict,
) -> None:
    """Render Jinja2 template to HTML."""
    env = Environment(
        loader=FileSystemLoader(str(Path(__file__).parent)),
        autoescape=False,
    )
    template = env.get_template("template.html")

    # Format ANOVA tables for template
    anova_data = {}
    for metric, table in anova_results.items():
        rows = []
        for source in table.index:
            row = table.loc[source]
            rows.append({
                "source": source.replace("C(placement)", "Placement")
                               .replace("C(angle)", "Angle")
                               .replace(":", " × "),
                "ss": f"{row['sum_sq']:.6f}",
                "df": f"{row['df']:.0f}",
                "f": f"{row['F']:.2f}" if not np.isnan(row['F']) else "—",
                "p": f"{row['PR(>F)']:.4f}" if not np.isnan(row['PR(>F)']) else "—",
                "eta_sq": f"{row['eta_sq']:.4f}",
            })
        anova_data[METRIC_LABELS_PLAIN[metric]] = rows

    # Format effect size tables for template
    effect_data = {}
    for metric, pairs in effect_sizes.items():
        effect_data[METRIC_LABELS_PLAIN[metric]] = [
            {"pair": p["pair"], "d": f"{p['cohen_d']:.3f}"} for p in pairs
        ]

    html = template.render(
        summary_rows=summary.to_dict("records"),
        conditions=CONDITIONS,
        condition_labels=CONDITION_LABELS,
        k_values=[1, 2, 3, 4],
        best_cells=best_cells,
        metric_labels_plain=METRIC_LABELS_PLAIN,
        anova_data=anova_data,
        effect_data=effect_data,
        n_seeds=len(df["seed"].unique()),
    )

    output_path = OUTPUT_DIR / "index.html"
    output_path.write_text(html, encoding="utf-8")
    print(f"  Report saved to {output_path}")


def main() -> None:
    print("Loading data...")
    df = load_data()
    print(f"  {len(df)} rows loaded")

    print("Generating box plots...")
    plot_boxplots(df)

    print("Computing summary table...")
    summary = summary_table(df)

    print("Computing best cells...")
    best_cells = compute_best_cells(df)

    print("Running two-way ANOVA...")
    anova_results = two_way_anova(df)
    for metric, table in anova_results.items():
        print(f"  {metric}:")
        print(table.to_string())

    print("Computing effect sizes...")
    effect_sizes = compute_effect_sizes(df)

    print("Running Tukey HSD post-hoc tests...")
    tukey_results = pairwise_tests(df)

    print("Selecting representative images...")
    select_representative_images(df)

    print("Generating algorithm illustration...")
    generate_algorithm_illustration()

    print("Rendering report...")
    render_report(df, summary, best_cells, anova_results, effect_sizes, tukey_results)

    print("Analysis complete!")


if __name__ == "__main__":
    main()
