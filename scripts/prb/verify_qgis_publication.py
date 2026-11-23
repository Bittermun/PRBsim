"""Read a published observation layer and reload it in the same QGIS session."""
import json
import sys
from urllib.parse import urljoin

from qgis.PyQt.QtCore import QDate
from qgis.core import Qgis, QgsApplication, QgsVectorLayer


def snapshot(layer):
    columns = ("recordId", "label", "observationDate", "accuracyMeters", "sourceId", "license", "reviewStatus", "revision")
    features = []
    for feature in layer.getFeatures():
        point = feature.geometry().asPoint()
        attributes = {field: feature[field] for field in columns}
        if isinstance(attributes["observationDate"], QDate):
            attributes["observationDate"] = attributes["observationDate"].toPyDate().isoformat()
        features.append({"attributes": attributes,
                         "coordinates": [point.x(), point.y()]})
    return {"version": Qgis.QGIS_VERSION, "provider": layer.providerType(),
            "records": sorted(features, key=lambda row: row["attributes"]["recordId"])}


def main():
    app = QgsApplication([], False)
    app.initQgis()
    layer = QgsVectorLayer(sys.argv[1], "PRB observation publication", "ogr")
    if not layer.isValid():
        raise RuntimeError(layer.error().summary())
    print(json.dumps(snapshot(layer)), flush=True)
    for request in sys.stdin:
        if request.strip() == "reload":
            layer.reload()
            print(json.dumps(snapshot(layer)), flush=True)
        elif request.strip() == "history":
            archive = QgsVectorLayer(urljoin(sys.argv[1], "releases/1.geojson"), "First release", "ogr")
            if not archive.isValid():
                raise RuntimeError(archive.error().summary())
            print(json.dumps(snapshot(archive)), flush=True)
            del archive
        else:
            break
    del layer
    app.exitQgis()


if __name__ == "__main__":
    main()
