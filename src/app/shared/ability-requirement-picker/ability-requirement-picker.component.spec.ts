import "@angular/compiler";
import { SimpleChange } from "@angular/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { AbilityRequirementPickerComponent } from "./ability-requirement-picker.component";

vi.mock("@ionic/angular/standalone", () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonToolbar: class {},
}));

describe("AbilityRequirementPickerComponent", () => {
  it("keeps a local working copy until save is emitted", () => {
    const component = new AbilityRequirementPickerComponent();
    const inputDrafts = [
      {
        draftId: "bind-1",
        abilityKey: "remove_bind",
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];

    component.catalogItems = [
      {
        key: "remove_bind",
        label: "Remove Bind",
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ["specialText"],
        availableCoverageModes: ["explicit"],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ["Removes bind"],
      },
      {
        key: "remove_slot_barrier",
        label: "Remove Slot Barrier",
        supportsTurns: true,
        supportsSlotTokens: true,
        availableSlotTokens: ["DEX"],
        availableSources: ["specialText"],
        availableCoverageModes: ["explicit"],
        matchCount: 6,
        sampleCharacterIds: [102],
        sampleTexts: ["Removes a slot barrier"],
      },
    ];
    component.drafts = inputDrafts;
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onCatalogItemSelect(component.catalogItems[1]!);

    expect(inputDrafts).toHaveLength(1);
    expect(component.workingDrafts()).toHaveLength(2);
  });

  it("emits a cloned draft payload when saved", () => {
    const component = new AbilityRequirementPickerComponent();
    const emitSpy = vi.spyOn(component.saveDrafts, "emit");

    component.catalogItems = [
      {
        key: "remove_bind",
        label: "Remove Bind",
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ["specialText"],
        availableCoverageModes: ["explicit"],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ["Removes bind"],
      },
    ];
    component.drafts = [
      {
        draftId: "bind-1",
        abilityKey: "remove_bind",
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.save();

    const emittedDrafts = emitSpy.mock.calls[0]?.[0] ?? [];

    expect(emittedDrafts).toEqual(component.workingDrafts());
    expect(emittedDrafts).not.toBe(component.workingDrafts());
  });

  it("keeps turns value 0 in working drafts so it can serialize as ignore turns", () => {
    const component = new AbilityRequirementPickerComponent();

    component.catalogItems = [
      {
        key: "remove_bind",
        label: "Remove Bind",
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ["specialText"],
        availableCoverageModes: ["explicit"],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ["Removes bind"],
      },
    ];
    component.drafts = [
      {
        draftId: "bind-1",
        abilityKey: "remove_bind",
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.onRequiredTurnsChange(
      "bind-1",
      { detail: { value: "0" } } as CustomEvent<{ value?: string | number | null }>,
    );

    expect(component.workingDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: "remove_bind",
        minTurns: 0,
      }),
    ]);
  });

  it("updates the selected row slot scope", () => {
    const component = new AbilityRequirementPickerComponent();

    component.catalogItems = [
      {
        key: "remove_bind",
        label: "Remove Bind",
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ["specialText"],
        availableCoverageModes: ["explicit"],
        matchCount: 10,
        sampleCharacterIds: [101],
        sampleTexts: ["Removes bind"],
      },
    ];
    component.drafts = [
      {
        draftId: "bind-1",
        abilityKey: "remove_bind",
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ];
    component.isOpen = true;
    component.ngOnChanges({
      catalogItems: new SimpleChange([], component.catalogItems, true),
      isOpen: new SimpleChange(false, true, true),
    });

    component.setSlotScope("bind-1", "leader");

    expect(component.workingDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: "remove_bind",
        slotScope: "leader",
      }),
    ]);
  });

  it("renders badge and conditional field blocks in the template", () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        "src/app/shared/ability-requirement-picker/ability-requirement-picker.component.html",
      ),
      "utf8",
    );

    expect(template).toContain("ability-picker-tile__badge");
    expect(template).toContain("ability-picker-mini-badge-list");
    expect(template).toContain("@if (row.supportsTurns)");
    expect(template).toContain('min="0"');
    expect(template).toContain("ability-picker-segmented");
    expect(template).toContain("setSlotScope(row.draft.draftId, 'leader')");
    expect(template).toContain("@if (row.supportsSlotTokens && row.availableSlotTokens.length)");
  });
});
