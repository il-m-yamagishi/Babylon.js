﻿/// <reference path="../../../dist/preview release/babylon.d.ts"/>

module BABYLON {
    var maxSimultaneousLights = 4;

    class TerrainMaterialDefines extends MaterialDefines {
        public DIFFUSE = false;
        public BUMP = false;
        public CLIPPLANE = false;
        public ALPHATEST = false;
        public POINTSIZE = false;
        public FOG = false;
        public SPECULARTERM = false;
        public NORMAL = false;
        public UV1 = false;
        public UV2 = false;
        public VERTEXCOLOR = false;
        public VERTEXALPHA = false;
        public NUM_BONE_INFLUENCERS = 0;
        public BonesPerMesh = 0;
        public INSTANCES = false;

        constructor() {
            super();
            this.rebuild();
        }
    }

    export class TerrainMaterial extends Material {
        @serializeAsTexture()
        public mixTexture: BaseTexture;
        
        @serializeAsTexture()
        public diffuseTexture1: Texture;
        
        @serializeAsTexture()
        public diffuseTexture2: Texture;
        
        @serializeAsTexture()
        public diffuseTexture3: Texture;
        
        @serializeAsTexture()
        public bumpTexture1: Texture;
        
        @serializeAsTexture()
        public bumpTexture2: Texture;
        
        @serializeAsTexture()
        public bumpTexture3: Texture;
        
        @serializeAsColor3()
        public diffuseColor = new Color3(1, 1, 1);
        
        @serializeAsColor3()
        public specularColor = new Color3(0, 0, 0);
        
        @serialize()
        public specularPower = 64;
        
        @serialize()
        public disableLighting = false;
        
        @serialize()
        public maxSimultaneousLights = 4;

        private _worldViewProjectionMatrix = Matrix.Zero();
        private _renderId: number;

        private _defines = new TerrainMaterialDefines();
        private _cachedDefines = new TerrainMaterialDefines();

        constructor(name: string, scene: Scene) {
            super(name, scene);

            this._cachedDefines.BonesPerMesh = -1;
        }

        public needAlphaBlending(): boolean {
            return (this.alpha < 1.0);
        }

        public needAlphaTesting(): boolean {
            return false;
        }

        public getAlphaTestTexture(): BaseTexture {
            return null;
        }

        // Methods   
        private _checkCache(scene: Scene, mesh?: AbstractMesh, useInstances?: boolean): boolean {
            if (!mesh) {
                return true;
            }

            if (this._defines.INSTANCES !== useInstances) {
                return false;
            }

            return false;
        }

        public isReady(mesh?: AbstractMesh, useInstances?: boolean): boolean {
            if (this.checkReadyOnlyOnce) {
                if (this._wasPreviouslyReady) {
                    return true;
                }
            }

            var scene = this.getScene();

            if (!this.checkReadyOnEveryCall) {
                if (this._renderId === scene.getRenderId()) {
                    if (this._checkCache(scene, mesh, useInstances)) {
                        return true;
                    }
                }
            }

            var engine = scene.getEngine();
            var needNormals = false;
            var needUVs = false;

            this._defines.reset();

            // Effect
            if (scene.clipPlane) {
                this._defines.CLIPPLANE = true;
            }

            if (engine.getAlphaTesting()) {
                this._defines.ALPHATEST = true;
            }

            // Point size
            if (this.pointsCloud || scene.forcePointsCloud) {
                this._defines.POINTSIZE = true;
            }

            // Fog
            if (scene.fogEnabled && mesh && mesh.applyFog && scene.fogMode !== Scene.FOGMODE_NONE && this.fogEnabled) {
                this._defines.FOG = true;
            }

            // Lights
            if (scene.lightsEnabled && !this.disableLighting) {
                needNormals = MaterialHelper.PrepareDefinesForLights(scene, mesh, this._defines, true, this.maxSimultaneousLights);
            }
            
            // Textures
            if (scene.texturesEnabled) {
                if (this.mixTexture && StandardMaterial.DiffuseTextureEnabled) {
                    if (!this.mixTexture.isReady()) {
                        return false;
                    } else {
                        needUVs = true;
                        this._defines.DIFFUSE = true;
                    }
                }
                if ((this.bumpTexture1 || this.bumpTexture2 || this.bumpTexture3) && StandardMaterial.BumpTextureEnabled) {
                    needUVs = true;
                    needNormals = true;
                    this._defines.BUMP = true;
                }
            }

            // Attribs
            if (mesh) {
                if (needNormals && mesh.isVerticesDataPresent(VertexBuffer.NormalKind)) {
                    this._defines.NORMAL = true;
                }
                if (needUVs) {
                    if (mesh.isVerticesDataPresent(VertexBuffer.UVKind)) {
                        this._defines.UV1 = true;
                    }
                    if (mesh.isVerticesDataPresent(VertexBuffer.UV2Kind)) {
                        this._defines.UV2 = true;
                    }
                }
                if (mesh.useVertexColors && mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) {
                    this._defines.VERTEXCOLOR = true;

                    if (mesh.hasVertexAlpha) {
                        this._defines.VERTEXALPHA = true;
                    }
                }
                if (mesh.useBones && mesh.computeBonesUsingShaders) {
                    this._defines.NUM_BONE_INFLUENCERS = mesh.numBoneInfluencers;
                    this._defines.BonesPerMesh = (mesh.skeleton.bones.length + 1);
                }

                // Instances
                if (useInstances) {
                    this._defines.INSTANCES = true;
                }
            }

            // Get correct effect      
            if (!this._defines.isEqual(this._cachedDefines)) {
                this._defines.cloneTo(this._cachedDefines);

                scene.resetCachedMaterial();

                // Fallbacks
                var fallbacks = new EffectFallbacks();             
                if (this._defines.FOG) {
                    fallbacks.addFallback(1, "FOG");
                }

                MaterialHelper.HandleFallbacksForShadows(this._defines, fallbacks, this.maxSimultaneousLights);
             
                if (this._defines.NUM_BONE_INFLUENCERS > 0) {
                    fallbacks.addCPUSkinningFallback(0, mesh);
                }

                //Attributes
                var attribs = [VertexBuffer.PositionKind];

                if (this._defines.NORMAL) {
                    attribs.push(VertexBuffer.NormalKind);
                }

                if (this._defines.UV1) {
                    attribs.push(VertexBuffer.UVKind);
                }

                if (this._defines.UV2) {
                    attribs.push(VertexBuffer.UV2Kind);
                }

                if (this._defines.VERTEXCOLOR) {
                    attribs.push(VertexBuffer.ColorKind);
                }

                MaterialHelper.PrepareAttributesForBones(attribs, mesh, this._defines, fallbacks);
                MaterialHelper.PrepareAttributesForInstances(attribs, this._defines);

                // Legacy browser patch
                var shaderName = "terrain";
                var join = this._defines.toString();
                var uniforms = ["world", "view", "viewProjection", "vEyePosition", "vLightsType", "vDiffuseColor", "vSpecularColor",
                    "vFogInfos", "vFogColor", "pointSize",
                    "vTextureInfos", 
                    "mBones",
                    "vClipPlane", "textureMatrix",
                    
                    "diffuse1Infos", "diffuse2Infos", "diffuse3Infos"
                ];
                var samplers = ["textureSampler", "diffuse1Sampler", "diffuse2Sampler", "diffuse3Sampler",
                    "bump1Sampler", "bump2Sampler", "bump3Sampler"
                ];
                
                MaterialHelper.PrepareUniformsAndSamplersList(uniforms, samplers, this._defines, this.maxSimultaneousLights);
                
                this._effect = scene.getEngine().createEffect(shaderName,
                    attribs, uniforms, samplers,
                    join, fallbacks, this.onCompiled, this.onError, { maxSimultaneousLights: this.maxSimultaneousLights });
            }
            if (!this._effect.isReady()) {
                return false;
            }

            this._renderId = scene.getRenderId();
            this._wasPreviouslyReady = true;

            return true;
        }

        public bindOnlyWorldMatrix(world: Matrix): void {
            this._effect.setMatrix("world", world);
        }

        public bind(world: Matrix, mesh?: Mesh): void {
            var scene = this.getScene();

            // Matrices        
            this.bindOnlyWorldMatrix(world);
            this._effect.setMatrix("viewProjection", scene.getTransformMatrix());

            // Bones
            MaterialHelper.BindBonesParameters(mesh, this._effect);

            if (scene.getCachedMaterial() !== this) {
                // Textures        
                if (this.mixTexture) {
                    this._effect.setTexture("textureSampler", this.mixTexture);
                    this._effect.setFloat2("vTextureInfos", this.mixTexture.coordinatesIndex, this.mixTexture.level);
                    this._effect.setMatrix("textureMatrix", this.mixTexture.getTextureMatrix());
                    
                    if (StandardMaterial.DiffuseTextureEnabled) {
                        if (this.diffuseTexture1) {
                            this._effect.setTexture("diffuse1Sampler", this.diffuseTexture1);
                            this._effect.setFloat2("diffuse1Infos", this.diffuseTexture1.uScale, this.diffuseTexture1.vScale);
                        }
                        if (this.diffuseTexture2) {
                            this._effect.setTexture("diffuse2Sampler", this.diffuseTexture2);
                            this._effect.setFloat2("diffuse2Infos", this.diffuseTexture2.uScale, this.diffuseTexture2.vScale);
                        }
                        if (this.diffuseTexture3) {
                            this._effect.setTexture("diffuse3Sampler", this.diffuseTexture3);
                            this._effect.setFloat2("diffuse3Infos", this.diffuseTexture3.uScale, this.diffuseTexture3.vScale);
                        }
                    }
                    
                    if (StandardMaterial.BumpTextureEnabled && scene.getEngine().getCaps().standardDerivatives) {
                        if (this.bumpTexture1) {
                            this._effect.setTexture("bump1Sampler", this.bumpTexture1);
                        }
                        if (this.bumpTexture2) {
                            this._effect.setTexture("bump2Sampler", this.bumpTexture2);
                        }
                        if (this.bumpTexture3) {
                            this._effect.setTexture("bump3Sampler", this.bumpTexture3);
                        }
                    }
                }
                // Clip plane
                MaterialHelper.BindClipPlane(this._effect, scene);

                // Point size
                if (this.pointsCloud) {
                    this._effect.setFloat("pointSize", this.pointSize);
                }

                this._effect.setVector3("vEyePosition", scene._mirroredCameraPosition ? scene._mirroredCameraPosition : scene.activeCamera.position);                
            }

            this._effect.setColor4("vDiffuseColor", this.diffuseColor, this.alpha * mesh.visibility);
            
            if (this._defines.SPECULARTERM) {
                this._effect.setColor4("vSpecularColor", this.specularColor, this.specularPower);
            }

            if (scene.lightsEnabled && !this.disableLighting) {
                MaterialHelper.BindLights(scene, mesh, this._effect, this._defines, this.maxSimultaneousLights);
            }

            // View
            if (scene.fogEnabled && mesh.applyFog && scene.fogMode !== Scene.FOGMODE_NONE) {
                this._effect.setMatrix("view", scene.getViewMatrix());
            }

            // Fog
            MaterialHelper.BindFogParameters(scene, mesh, this._effect);

            this._afterBind(mesh);
        }

        public getAnimatables(): IAnimatable[] {
            var results = [];

            if (this.mixTexture && this.mixTexture.animations && this.mixTexture.animations.length > 0) {
                results.push(this.mixTexture);
            }

            return results;
        }

        public dispose(forceDisposeEffect?: boolean): void {
            if (this.mixTexture) {
                this.mixTexture.dispose();
            }

            super.dispose(forceDisposeEffect);
        }
        
        public clone(name: string): TerrainMaterial {
            return SerializationHelper.Clone(() => new TerrainMaterial(name, this.getScene()), this);
        }

        public serialize(): any {
            var serializationObject = SerializationHelper.Serialize(this);
            serializationObject.customType = "BABYLON.TerrainMaterial";
            return serializationObject;
        }

        // Statics
        public static Parse(source: any, scene: Scene, rootUrl: string): TerrainMaterial {
            return SerializationHelper.Parse(() => new TerrainMaterial(source.name, scene), source, scene, rootUrl);
        }
    }
} 

