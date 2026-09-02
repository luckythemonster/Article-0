import { describe, it, expect } from "vitest";
import { EdplayLoader } from "./EdplayLoader";
import { typeInertTerminals } from "./InertTerminals";
import type { EdPlayFile, EdTileDef } from "./types";

const def = (handle: number, ref: string, components: EdTileDef["DataComponents"] = []): EdTileDef =>
  ({ Handle: handle, Ref: ref, DataComponents: components }) as unknown as EdTileDef;

/** A one-level export with `boards` of `[handle, ...]` and the given TileDefs. */
function exportOf(boards: Record<string, number[]>, defs: EdTileDef[]): EdPlayFile {
  return {
    SpriteSheets: [],
    TileDefs: defs,
    Width: 36,
    Height: 18,
    TileWidth: 32,
    TileHeight: 32,
    Name: "t",
    DataTypes: {
      EnumDefs: [],
      DataStructures: [
        {
          Name: "Terminal",
          Id: "d",
          Fields: [
            { Name: "hackTime", Type: "float", DefaultValues: ["2.2"], IsPublic: true },
            { Name: "type", Type: "enum", DefaultValues: ["LOG_CACHE"], IsPublic: true },
          ],
        },
      ],
    },
    Levels: [
      {
        Name: "main1",
        Id: "l",
        Boards: Object.entries(boards).map(([Name, handles]) => ({
          Name,
          Width: 36,
          Height: 18,
          IsVisible: true,
          Id: Name,
          Tiles: handles.map((Handle, i) => ({ Handle, X: i, Y: 0 })),
        })),
      },
    ],
  } as unknown as EdPlayFile;
}

describe("typeInertTerminals", () => {
  it("gives a component-less terminal the export's own schema defaults", () => {
    // The author moved main1's terminal onto a `terminals` board in v0.4 — the
    // intent is unambiguous — but never attached the component, so the engine
    // read scenery and the run had no log cache until the far side of the map.
    const raw = exportOf({ terminals: [1] }, [def(1, "terminal1")]);
    expect(typeInertTerminals(raw)).toEqual(["terminal1"]);

    const { map } = EdplayLoader.parse(raw, []);
    const tile = map.levels[0].layers[0].tiles[0];
    // Resolved by the loader from the DataStructure, not written here: the point
    // of patching before the parse is that nothing is invented. They arrive marked
    // as the editor's own defaults too, which is exactly what they are — nobody
    // chose them — and is what keeps `num` from reading them as authored tuning.
    expect(tile.components).toEqual([
      {
        type: "terminal",
        values: { hackTime: "2.2", type: "LOG_CACHE" },
        defaults: { hackTime: "2.2", type: "LOG_CACHE" },
      },
    ]);
  });

  it("never touches a terminal the author did wire up", () => {
    const raw = exportOf({ terminals: [1] }, [
      def(1, "terminal6", [
        { DataType: "Terminal", Variables: [{ Name: "type", Values: ["DESYCHRONIZATION"] }] },
      ]),
    ]);
    expect(typeInertTerminals(raw)).toEqual([]);
  });

  it("leaves scenery sharing the board alone", () => {
    // main2vault files `security_node1` beside four real terminals.
    const raw = exportOf({ terminals: [1, 2] }, [def(1, "security_node1"), def(2, "stairwell1")]);
    expect(typeInertTerminals(raw)).toEqual([]);
  });

  it("only fires for tiles actually placed on a terminals board", () => {
    // A TileDef is shared by every placement of it, so a terminal-looking tile
    // dropped somewhere as decoration must not become hackable.
    const raw = exportOf({ walls: [1] }, [def(1, "terminal4")]);
    expect(typeInertTerminals(raw)).toEqual([]);
  });

  it("declines when the export declares no Terminal schema to default to", () => {
    const raw = exportOf({ terminals: [1] }, [def(1, "terminal1")]);
    raw.DataTypes.DataStructures = [];
    expect(typeInertTerminals(raw)).toEqual([]);
  });
});
