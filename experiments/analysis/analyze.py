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
from scipy.optimize import curve_fit
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
METRICS = ["eContrast", "hAngle", "rAuto1", "cCov", "uVor", "rAuto2", "rAuto3", "xi"]
METRIC_LABELS = {
    "eContrast": r"$E_{\mathrm{contrast}}$",
    "hAngle": r"$H_{\mathrm{angle}}$",
    "rAuto1": r"$R_1$",
    "cCov": r"$C_{\mathrm{cov}}$",
    "uVor": r"$U_{\mathrm{vor}}$",
    "rAuto2": r"$R_2$",
    "rAuto3": r"$R_3$",
    "xi": r"$\xi$",
}
METRIC_LABELS_PLAIN = {
    "eContrast": "E_contrast",
    "hAngle": "H_angle",
    "rAuto1": "R_1",
    "cCov": "C_cov",
    "uVor": "U_vor",
    "rAuto2": "R_2",
    "rAuto3": "R_3",
    "xi": "xi",
}
# For E_contrast, H_angle, C_cov: higher is better; for U_vor, xi: lower is better
# For R_1, R_2, R_3: |mean| closest to 0 is best (handled specially in best/second-best)
METRIC_HIGHER_IS_BETTER = {
    "eContrast": True,
    "hAngle": True,
    "rAuto1": None,  # special: |mean| closest to 0
    "cCov": True,
    "uVor": False,
    "rAuto2": None,  # special: |mean| closest to 0
    "rAuto3": None,  # special: |mean| closest to 0
    "xi": False,  # lower is better (rapid decorrelation)
}


def _exp_decay(k, A, xi):
    """Exponential decay model: |R_k| ~ A * exp(-k/xi)."""
    return A * np.exp(-k / xi)


def compute_xi(profile: list[dict]) -> tuple[float, float]:
    """Fit |R_k| ~ A * exp(-k/ξ) via curve_fit. Return (ξ, R²)."""
    if not profile or len(profile) < 2:
        return (np.nan, np.nan)
    ks = np.array([e["k"] for e in profile], dtype=float)
    abs_rk = np.array([abs(e["rk"]) for e in profile], dtype=float)
    weights = np.array([e["nPairs"] for e in profile], dtype=float)

    # All near-zero → no correlation to fit
    if np.max(abs_rk) < 0.01:
        return (0.0, np.nan)

    try:
        popt, _ = curve_fit(
            _exp_decay, ks, abs_rk,
            p0=[abs_rk[0], 2.0],
            sigma=1.0 / np.sqrt(np.maximum(weights, 1)),
            bounds=([0, 0.01], [2.0, 100.0]),
            maxfev=5000,
        )
        xi = float(popt[1])
        # Compute R²
        predicted = _exp_decay(ks, *popt)
        ss_res = np.sum((abs_rk - predicted) ** 2)
        ss_tot = np.sum((abs_rk - np.mean(abs_rk)) ** 2)
        r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else np.nan
        return (xi, float(r_squared))
    except (RuntimeError, ValueError):
        return (np.inf, np.nan)


def load_data() -> pd.DataFrame:
    with open(RESULTS_DIR / "metrics.json") as f:
        data = json.load(f)
    df = pd.DataFrame(data)

    # Extract rAuto1 and xi from rAutoProfile
    def _extract_r1(profile):
        if not profile:
            return 0.0
        for e in profile:
            if e["k"] == 1:
                return e["rk"]
        return 0.0

    if "rAutoProfile" in df.columns:
        df["rAuto1"] = df["rAutoProfile"].apply(_extract_r1)
        xi_results = df["rAutoProfile"].apply(compute_xi)
        df["xi"] = xi_results.apply(lambda x: x[0])
        df["xi_r2"] = xi_results.apply(lambda x: x[1])
    else:
        # Backward compat: no profile data
        df["rAuto1"] = 0.0
        df["xi"] = np.nan
        df["xi_r2"] = np.nan

    return df


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
        if metric in ("rAuto1", "rAuto2", "rAuto3"):
            ax.set_ylim(-1, 1)
            ax.axhline(y=0, color="#999", linewidth=0.8, linestyle="--", zorder=1)
        elif metric == "xi":
            # Auto-scale for xi; skip infinite values
            finite_vals = [v for vals in data for v in vals if np.isfinite(v)]
            if finite_vals:
                ax.set_ylim(0, max(finite_vals) * 1.1)
        else:
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
            vals = sub[m].values.astype(float)
            vals = vals[np.isfinite(vals)]
            means[CONDITION_LABELS[cond]] = np.mean(vals) if len(vals) > 0 else np.inf
        direction = METRIC_HIGHER_IS_BETTER[m]
        if direction is None:
            # R_k: |mean| closest to 0 is best
            best_cond = min(means, key=lambda k: abs(means[k]))
        elif direction:
            best_cond = max(means, key=means.get)
        else:
            best_cond = min(means, key=means.get)
        best[METRIC_LABELS_PLAIN[m]] = best_cond
    return best


def compute_second_best_cells(df: pd.DataFrame) -> dict:
    """For each metric, find the second-best condition. Returns {metric_plain: condition_label}."""
    second_best = {}
    for m in METRICS:
        means = {}
        for cond in CONDITIONS:
            sub = df[df["condition"] == cond]
            vals = sub[m].values.astype(float)
            vals = vals[np.isfinite(vals)]
            means[CONDITION_LABELS[cond]] = np.mean(vals) if len(vals) > 0 else np.inf
        direction = METRIC_HIGHER_IS_BETTER[m]
        if direction is None:
            # R_k: sort by |mean|
            sorted_conds = sorted(means, key=lambda k: abs(means[k]))
        elif direction:
            sorted_conds = sorted(means, key=means.get, reverse=True)
        else:
            sorted_conds = sorted(means, key=means.get)
        if len(sorted_conds) >= 2:
            second_best[METRIC_LABELS_PLAIN[m]] = sorted_conds[1]
    return second_best


def summary_table(df: pd.DataFrame) -> pd.DataFrame:
    """Mean +/- SD for each condition x metric (single table, k=1 only)."""
    rows = []
    for cond in CONDITIONS:
        sub = df[df["condition"] == cond]
        row = {"condition": CONDITION_LABELS[cond]}
        for m in METRICS:
            vals = sub[m].values.astype(float)
            finite = vals[np.isfinite(vals)]
            if len(finite) > 0:
                mean = np.mean(finite)
                std = np.std(finite, ddof=1) if len(finite) > 1 else 0.0
                row[METRIC_LABELS_PLAIN[m]] = f"{mean:.3f} \u00b1 {std:.3f}"
            else:
                row[METRIC_LABELS_PLAIN[m]] = "\u221e"
        row["nTiles (mean)"] = f"{sub['nTiles'].mean():.1f}"
        row["nEdges (mean)"] = f"{sub['nEdges'].mean():.1f}"
        rows.append(row)
    return pd.DataFrame(rows)


def two_way_anova(df: pd.DataFrame) -> dict:
    """Two-way ANOVA: placement × angle for each metric (original 4 conditions only).

    Returns {metric: {"table": DataFrame, "shapiro_stat", "shapiro_p",
                       "levene_stat", "levene_p", "n_excluded"}}.
    """
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
        df_m = df.copy()
        n_before = len(df_m)
        # Skip metrics with non-finite values (e.g. xi with inf)
        if not np.all(np.isfinite(df_m[metric])):
            df_m = df_m[np.isfinite(df_m[metric])]
        n_excluded = n_before - len(df_m)
        if len(df_m) < 10:
            continue
        model = ols(f"{metric} ~ C(placement) * C(angle)", data=df_m).fit()
        table = anova_lm(model, typ=2)
        # Compute η² = SS_effect / SS_total
        ss_total = table["sum_sq"].sum()
        table["eta_sq"] = table["sum_sq"] / ss_total

        # Compute ω² = (SS_effect - df_effect * MS_error) / (SS_total + MS_error)
        ss_resid = table.loc["Residual", "sum_sq"]
        df_resid = table.loc["Residual", "df"]
        ms_error = ss_resid / df_resid if df_resid > 0 else 0
        omega_sq_vals = []
        for source in table.index:
            if source == "Residual":
                omega_sq_vals.append(np.nan)
            else:
                ss_eff = table.loc[source, "sum_sq"]
                df_eff = table.loc[source, "df"]
                omega = (ss_eff - df_eff * ms_error) / (ss_total + ms_error)
                omega_sq_vals.append(max(omega, 0))  # floor at 0
        table["omega_sq"] = omega_sq_vals

        # Shapiro-Wilk test on residuals (normality)
        resid = model.resid
        if len(resid) >= 3:
            shapiro_stat, shapiro_p = stats.shapiro(resid)
        else:
            shapiro_stat, shapiro_p = np.nan, np.nan

        # Levene's test across conditions (homoscedasticity)
        groups = [
            df_m[df_m["condition"] == c][metric].values
            for c in ANOVA_CONDITIONS
            if c in df_m["condition"].values
        ]
        if len(groups) >= 2 and all(len(g) >= 2 for g in groups):
            levene_stat, levene_p = stats.levene(*groups)
        else:
            levene_stat, levene_p = np.nan, np.nan

        results[metric] = {
            "table": table,
            "shapiro_stat": float(shapiro_stat),
            "shapiro_p": float(shapiro_p),
            "levene_stat": float(levene_stat),
            "levene_p": float(levene_p),
            "n_excluded": n_excluded,
        }
    return results


def compute_effect_sizes(df: pd.DataFrame) -> dict:
    """Pairwise Cohen's d (pooled SD) for the 4 factorial conditions (6 pairs) per metric."""
    results = {}
    for metric in METRICS:
        pairs = []
        for i in range(len(ANOVA_CONDITIONS)):
            for j in range(i + 1, len(ANOVA_CONDITIONS)):
                c1, c2 = ANOVA_CONDITIONS[i], ANOVA_CONDITIONS[j]
                x1 = df[df["condition"] == c1][metric].values.astype(float)
                x2 = df[df["condition"] == c2][metric].values.astype(float)
                x1 = x1[np.isfinite(x1)]
                x2 = x2[np.isfinite(x2)]
                n1, n2 = len(x1), len(x2)
                pooled_sd = np.sqrt(
                    ((n1 - 1) * x1.std(ddof=1) ** 2 + (n2 - 1) * x2.std(ddof=1) ** 2)
                    / (n1 + n2 - 2)
                )
                d = (x1.mean() - x2.mean()) / pooled_sd if pooled_sd > 0 else float("inf")
                pairs.append({
                    "pair": f"{CONDITION_LABELS[c1]} vs {CONDITION_LABELS[c2]}",
                    "cohen_d": d,
                })
        results[metric] = pairs
    return results


def pairwise_tests(df: pd.DataFrame) -> dict:
    """Tukey HSD post-hoc for each metric (4 factorial conditions only)."""
    results = {}
    for metric in METRICS:
        df_m = df[np.isfinite(df[metric])].copy()
        df_m = df_m[df_m["condition"].isin(ANOVA_CONDITIONS)]
        if len(df_m) < 10:
            continue
        tukey = pairwise_tukeyhsd(
            df_m[metric],
            df_m["condition"].map(CONDITION_LABELS),
            alpha=0.05,
        )
        # Extract structured data for template rendering
        rows = []
        groups = list(tukey.groupsunique)
        idx = 0
        for i in range(len(groups)):
            for j in range(i + 1, len(groups)):
                rows.append({
                    "group1": str(groups[i]),
                    "group2": str(groups[j]),
                    "meandiff": f"{tukey.meandiffs[idx]:.4f}",
                    "p_adj": f"{tukey.pvalues[idx]:.4f}",
                    "lower": f"{tukey.confint[idx][0]:.4f}",
                    "upper": f"{tukey.confint[idx][1]:.4f}",
                    "reject": "Yes" if tukey.reject[idx] else "No",
                })
                idx += 1
        results[metric] = rows
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


def plot_correlogram(df: pd.DataFrame) -> None:
    """Plot mean R_k ± 95% CI per condition across graph distance k."""
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    if "rAutoProfile" not in df.columns:
        print("  Skipping correlogram (no rAutoProfile data)")
        return

    fig, ax = plt.subplots(figsize=(8, 5))
    colors = {"poissonBfs": "#4C72B0", "poissonRandom": "#55A868",
              "randomBfs": "#C44E52", "randomRandom": "#8172B2",
              "gridCheckerboard": "#CCB974"}

    for cond in CONDITIONS:
        sub = df[df["condition"] == cond]
        # Collect R_k values per k across all seeds
        k_vals: dict[int, list[float]] = {}
        for profile in sub["rAutoProfile"]:
            if not profile:
                continue
            for entry in profile:
                k = entry["k"]
                k_vals.setdefault(k, []).append(entry["rk"])

        if not k_vals:
            continue

        ks = sorted(k_vals.keys())
        means = [np.mean(k_vals[k]) for k in ks]
        ci95 = [
            stats.t.ppf(0.975, len(k_vals[k]) - 1) * np.std(k_vals[k], ddof=1) / np.sqrt(len(k_vals[k]))
            if len(k_vals[k]) > 1 else 0.0
            for k in ks
        ]

        ax.plot(ks, means, "o-", color=colors[cond], label=CONDITION_LABELS[cond],
                markersize=4, linewidth=1.5)
        ax.fill_between(ks,
                        [m - c for m, c in zip(means, ci95)],
                        [m + c for m, c in zip(means, ci95)],
                        color=colors[cond], alpha=0.15)

    ax.axhline(y=0, color="#999", linewidth=0.8, linestyle="--", zorder=1)
    ax.set_xlabel("Graph distance $k$", fontsize=11)
    ax.set_ylabel("$R_k$", fontsize=11)
    ax.set_title("Angle Autocorrelation Correlogram", fontsize=13)
    ax.set_ylim(-1, 1)
    ax.legend(fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    plt.tight_layout()
    fig.savefig(ASSETS_DIR / "correlogram.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    print("  Saved correlogram.png")


def plot_r1_xi_scatter(df: pd.DataFrame) -> None:
    """Scatter plot of |R_1| vs ξ, color-coded by condition."""
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    if "xi" not in df.columns or "rAuto1" not in df.columns:
        print("  Skipping R1-xi scatter (missing data)")
        return

    fig, ax = plt.subplots(figsize=(8, 6))
    colors = {"poissonBfs": "#4C72B0", "poissonRandom": "#55A868",
              "randomBfs": "#C44E52", "randomRandom": "#8172B2",
              "gridCheckerboard": "#CCB974"}

    for cond in CONDITIONS:
        sub = df[df["condition"] == cond]
        xi_vals = sub["xi"].values.copy()
        r1_abs = np.abs(sub["rAuto1"].values)
        # Cap infinite xi for display
        finite_mask = np.isfinite(xi_vals)
        max_finite = np.max(xi_vals[finite_mask]) if np.any(finite_mask) else 10
        xi_vals[~finite_mask] = max_finite * 1.5
        ax.scatter(xi_vals, r1_abs, c=colors[cond], label=CONDITION_LABELS[cond],
                   alpha=0.5, s=15, edgecolors="none")

    ax.set_xlabel(r"Correlation length $\xi$", fontsize=11)
    ax.set_ylabel(r"$|R_1|$", fontsize=11)
    ax.set_title(r"$|R_1|$ vs $\xi$", fontsize=13)
    ax.set_ylim(0, 1.05)
    ax.legend(fontsize=9)
    ax.grid(alpha=0.3)

    # Annotate regions
    xlim = ax.get_xlim()
    ax.text(xlim[1] * 0.05, 0.95, "Amorphous\n(low $|R_1|$, low $\\xi$)",
            fontsize=8, color="#999", fontstyle="italic", ha="left", va="top")
    ax.text(xlim[1] * 0.5, 0.95, "Frustrated\nshort-range order",
            fontsize=8, color="#999", fontstyle="italic", ha="center", va="top")
    ax.text(xlim[1] * 0.9, 0.95, "Periodic\n(high $|R_1|$, high $\\xi$)",
            fontsize=8, color="#999", fontstyle="italic", ha="right", va="top")

    plt.tight_layout()
    fig.savefig(ASSETS_DIR / "scatter_r1_xi.png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    print("  Saved scatter_r1_xi.png")


def render_report(
    df: pd.DataFrame,
    summary: pd.DataFrame,
    best_cells: dict,
    second_best_cells: dict,
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

    # Format ANOVA tables for template (new dict structure from two_way_anova)
    anova_data = {}
    assumption_data = {}
    anova_exclusions = {}
    for metric, result in anova_results.items():
        table = result["table"]
        rows = []
        for source in table.index:
            row = table.loc[source]
            omega_sq_val = row["omega_sq"]
            rows.append({
                "source": source.replace("C(placement)", "Placement")
                               .replace("C(angle)", "Angle")
                               .replace(":", " × "),
                "ss": f"{row['sum_sq']:.6f}",
                "df": f"{row['df']:.0f}",
                "f": f"{row['F']:.2f}" if not np.isnan(row['F']) else "—",
                "p": f"{row['PR(>F)']:.4f}" if not np.isnan(row['PR(>F)']) else "—",
                "eta_sq": f"{row['eta_sq']:.4f}",
                "omega_sq": f"{omega_sq_val:.4f}" if not np.isnan(omega_sq_val) else "—",
            })
        plain = METRIC_LABELS_PLAIN[metric]
        anova_data[plain] = rows
        assumption_data[plain] = {
            "shapiro_stat": f"{result['shapiro_stat']:.4f}" if np.isfinite(result['shapiro_stat']) else "—",
            "shapiro_p": f"{result['shapiro_p']:.4f}" if np.isfinite(result['shapiro_p']) else "—",
            "levene_stat": f"{result['levene_stat']:.4f}" if np.isfinite(result['levene_stat']) else "—",
            "levene_p": f"{result['levene_p']:.4f}" if np.isfinite(result['levene_p']) else "—",
        }
        anova_exclusions[plain] = result["n_excluded"]

    # Format effect size tables for template (Fix 7: handle inf/nan)
    effect_data = {}
    for metric, pairs in effect_sizes.items():
        effect_data[METRIC_LABELS_PLAIN[metric]] = [
            {
                "pair": p["pair"],
                "d": f"{p['cohen_d']:.3f}" if np.isfinite(p["cohen_d"]) else "—",
            }
            for p in pairs
        ]

    # Format Tukey HSD tables for template
    tukey_data = {}
    for metric, rows in tukey_results.items():
        tukey_data[METRIC_LABELS_PLAIN[metric]] = rows

    # Compute per-condition mean R² for ξ fit (Fix 4)
    xi_r2_data = {}
    if "xi_r2" in df.columns:
        for cond in CONDITIONS:
            sub = df[df["condition"] == cond]
            r2_vals = sub["xi_r2"].values.astype(float)
            finite = r2_vals[np.isfinite(r2_vals)]
            if len(finite) > 0:
                xi_r2_data[CONDITION_LABELS[cond]] = f"{np.mean(finite):.3f}"
            else:
                xi_r2_data[CONDITION_LABELS[cond]] = "—"

    has_correlogram = (ASSETS_DIR / "correlogram.png").exists()
    has_scatter = (ASSETS_DIR / "scatter_r1_xi.png").exists()

    html = template.render(
        summary_rows=summary.to_dict("records"),
        conditions=CONDITIONS,
        condition_labels=CONDITION_LABELS,
        k_values=[1, 2, 3, 4],
        best_cells=best_cells,
        second_best_cells=second_best_cells,
        metric_labels_plain=METRIC_LABELS_PLAIN,
        anova_data=anova_data,
        assumption_data=assumption_data,
        anova_exclusions=anova_exclusions,
        effect_data=effect_data,
        xi_r2_data=xi_r2_data,
        n_seeds=len(df["seed"].unique()),
        has_correlogram=has_correlogram,
        has_scatter=has_scatter,
        tukey_data=tukey_data,
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

    print("Computing second-best cells...")
    second_best_cells = compute_second_best_cells(df)

    print("Running two-way ANOVA...")
    anova_results = two_way_anova(df)
    for metric, result in anova_results.items():
        print(f"  {metric}:")
        print(result["table"].to_string())
        print(f"    Shapiro-Wilk: W={result['shapiro_stat']:.4f}, p={result['shapiro_p']:.4f}")
        print(f"    Levene: F={result['levene_stat']:.4f}, p={result['levene_p']:.4f}")
        if result["n_excluded"] > 0:
            print(f"    ({result['n_excluded']} rows excluded due to non-finite values)")

    print("Computing effect sizes...")
    effect_sizes = compute_effect_sizes(df)

    print("Running Tukey HSD post-hoc tests...")
    tukey_results = pairwise_tests(df)

    print("Selecting representative images...")
    select_representative_images(df)

    print("Generating algorithm illustration...")
    generate_algorithm_illustration()

    print("Generating correlogram...")
    plot_correlogram(df)

    print("Generating R1-xi scatter...")
    plot_r1_xi_scatter(df)

    print("Rendering report...")
    render_report(df, summary, best_cells, second_best_cells, anova_results, effect_sizes, tukey_results)

    print("Analysis complete!")


if __name__ == "__main__":
    main()
