import docker
from docker.errors import DockerException, NotFound, APIError

def stop_container(container_name: str) -> dict:
    if not container_name or not isinstance(container_name, str):
        return {"status": "error", "error": "Invalid container name"}

    try:
        client = docker.from_env()
        container = client.containers.get(container_name)
        container.remove(force=True)
        return {"status": "ok", "container": container_name}
    except NotFound:
        return {"status": "error", "container": container_name, "error": "container not found"}
    except (DockerException, APIError) as e:
        return {"status": "error", "container": container_name, "error": str(e)}
