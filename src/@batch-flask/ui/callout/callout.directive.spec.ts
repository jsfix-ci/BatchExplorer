import { Overlay } from "@angular/cdk/overlay";
import { Component, ViewChild } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { CalloutDirective } from "..";

@Component({
    template: `<input [blCallout] />`
})
class HostComponent {
    @ViewChild(CalloutDirective) theDirective;
}

describe("CalloutDirective", () => {
    let fixture: ComponentFixture<HostComponent>;
    let input: HTMLInputElement;
    let testComponent: HostComponent;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [CalloutDirective, HostComponent],
            providers: [{
                provide: Overlay, useValue: {
                    position: () => ({
                        connectedTo: () => ({
                            withPositions: () => null
                        })
                    }),
                    scrollStrategies: { block: () => null }
                }
            }]
        }).compileComponents();
        fixture = TestBed.createComponent(HostComponent);

        const target = fixture.debugElement.query(By.css("input"));
        testComponent = target.componentInstance;
        input = target.nativeElement;

        fixture.detectChanges();
    });

    it("can be toggled by keyboard", () => {
        const directive = testComponent.theDirective;
        const openSpy = spyOn(directive, "open");
        const closeSpy = spyOn(directive, "close");

        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(openSpy).toHaveBeenCalledOnce();
        expect(closeSpy).not.toHaveBeenCalled();

        openSpy.calls.reset();
        directive._overlayRef = {}; // simulate an open callout

        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(openSpy).not.toHaveBeenCalled();
        expect(closeSpy).toHaveBeenCalledOnce();
    });
});
