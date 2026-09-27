"""Local (Docker-free) bundling for the API Lambda.

`PythonFunction`'s normal Docker-based bundling pulls AWS SAM's build
image and then, as part of *that image's own setup*, reaches out to PyPI
from inside the container to install pipenv/poetry. In this environment
all outbound HTTPS is transparently intercepted by an egress proxy that
terminates TLS with its own CA certificate — a cert the Docker build
container has no reason to trust, so that in-container PyPI fetch fails
certificate verification. That's a property of the sandbox's network
policy, not something to work around by disabling verification.

The host itself talks to PyPI fine (pip already works here — it's how the
CDK app's own venv got installed), so we bundle locally instead:
`pip install --platform manylinux2014_x86_64 --only-binary=:all:` forces
pip to fetch prebuilt Lambda-compatible wheels — the same manylinux
wheels the SAM Docker image would have produced — regardless of the
host's own OS/arch mix, so the result is still a correct Lambda
deployment package even though it wasn't assembled inside a Lambda-like
container.
"""
import shutil
import subprocess
import sys
from pathlib import Path

import jsii
from aws_cdk import ILocalBundling


@jsii.implements(ILocalBundling)
class LocalApiBundling:
    """Installs API dependencies as Lambda-compatible wheels and copies
    the FastAPI source in, without ever invoking Docker."""

    def __init__(self, source_dir: str, python_version: str = "3.12"):
        self._source_dir = Path(source_dir)
        self._python_version = python_version

    def try_bundle(self, output_dir: str, *args, **kwargs) -> bool:
        out = Path(output_dir)
        requirements = self._source_dir / "requirements.txt"

        subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--platform",
                "manylinux2014_x86_64",
                "--implementation",
                "cp",
                "--python-version",
                self._python_version,
                "--only-binary=:all:",
                "--target",
                str(out),
                "-r",
                str(requirements),
            ],
            check=True,
        )

        skip = {"requirements.txt", "__pycache__", ".venv", "venv", ".pytest_cache"}
        for item in self._source_dir.iterdir():
            if item.name in skip:
                continue
            dest = out / item.name
            if item.is_dir():
                shutil.copytree(item, dest, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            else:
                shutil.copy2(item, dest)

        return True
