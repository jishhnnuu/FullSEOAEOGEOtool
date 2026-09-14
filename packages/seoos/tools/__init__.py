from seoos.tools.registry import (
    REGISTRY,
    Tool,
    ToolContext,
    ToolExecutor,
    ToolOutcome,
    ToolRegistry,
    autonomy_allows,
    tool,
)


def load_all_tools() -> ToolRegistry:
    """Import every tool module so the decorators run.

    Called once at process start. Keeping it explicit beats import-time magic
    because a missing tool then fails loudly at boot rather than silently at
    the moment an agent needs it.
    """
    from seoos.tools import (  # noqa: F401
        analytics_tools,
        brand_tools,
        content_tools,
        crawl_tools,
        keyword_tools,
        local_tools,
        offpage_tools,
        publish_tools,
        reporting_tools,
        workflow_tools,
    )

    return REGISTRY


__all__ = [
    "REGISTRY", "Tool", "ToolContext", "ToolExecutor", "ToolOutcome",
    "ToolRegistry", "tool", "autonomy_allows", "load_all_tools",
]
